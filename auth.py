# auth.py
from flask import Blueprint, request, redirect, render_template, session, url_for, flash
from Database import UserInfo
import hashlib
import os
import uuid
from datetime import datetime, timedelta
from functools import wraps

import logging
logger = logging.getLogger(__name__)
auth_bp = Blueprint("auth", __name__, template_folder="frontend/templates")

def hash_password(password, salt=None):
    """Hash a password for storing."""
    if salt is None:
        salt = os.urandom(32)  # A new salt for this user
    pwdhash = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 100000)
    return salt + pwdhash

def verify_password(stored_password, provided_password):
    """Verify a stored password against one provided by user"""
    salt = stored_password[:32]  # The salt is stored at the beginning of the hash
    stored_hash = stored_password[32:]
    pwdhash = hashlib.pbkdf2_hmac('sha256', provided_password.encode('utf-8'), salt, 100000)
    return pwdhash == stored_hash


@auth_bp.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "POST":
        username = request.form["username"]
        password = request.form["password"]
        confirm_password = request.form["confirm_password"]

        # Log registration attempt (without password)
        logger.info(f"Registration attempt for username: {username}")

        # rules of password
        if len(password) < 8:
            logger.warning(f"Registration failed - password too short for username: {username}")
            flash("Password must be at least 8 characters long")
            return redirect(url_for("auth.register"))

        if not any(char.isdigit() for char in password):
            logger.warning(f"Registration failed - missing number in password for username: {username}")
            flash("Password must contain at least one number")
            return redirect(url_for("auth.register"))

        if not any(char.isupper() for char in password):
            logger.warning(f"Registration failed - missing uppercase in password for username: {username}")
            flash("Password must contain at least one uppercase letter")
            return redirect(url_for("auth.register"))

        if not any(char.islower() for char in password):
            logger.warning(f"Registration failed - missing lowercase in password for username: {username}")
            flash("Password must contain at least one lowercase letter")
            return redirect(url_for("auth.register"))

        if password != confirm_password:
            logger.warning(f"Registration failed - password mismatch for username: {username}")
            flash("Passwords do not match")
            return redirect(url_for("auth.register"))

        if UserInfo.find_one({"username": username}):
            logger.warning(f"Registration failed - username already exists: {username}")
            flash("Username already exists")
            return redirect(url_for("auth.register"))

        user_id = str(uuid.uuid4())

        # Hash the password before storing
        hashed_password = hash_password(password)
        UserInfo.insert_one({
            "username": username,
            "password": hashed_password,
            "user_id": user_id,
            "matches_played": 0,
            "matches_won": 0,
            "ImgUrl": "/static/images/Icon/defaultIcon.png"
        })

        logger.info(f"Registration successful for username: {username}")
        flash("Signup successful, please log in")
        return redirect(url_for("auth.login"))

    return render_template("register.html")


@auth_bp.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form["username"]
        password = request.form["password"]

        # Log login attempt (without password)
        logger.info(f"Login attempt for username: {username}")

        user = UserInfo.find_one({"username": username})
        if user and verify_password(user["password"], password):
            auth_token = str(uuid.uuid4())
            hash_token = hashlib.sha256(auth_token.encode()).hexdigest()
            token_expire = datetime.utcnow() + timedelta(days=1)

            UserInfo.update_one({"username": username}, {"$set": {
                "auth_token": hash_token,
                "token_expire": token_expire,
            }})

            response = redirect(url_for("home"))
            response.set_cookie(
                "auth_token", auth_token,
                httponly=True,
                secure=os.environ.get("FLASK_ENV") == "production", #False in development, true in production!
                samesite='Lax',
                max_age=60 * 60 * 24  # 1 day
            )

            logger.info(f"Login successful for username: {username}")
            return response
        else:
            reason = "wrong password" if user else "username does not exist"
            logger.warning(f"Login failed for username: {username} - reason: {reason}")
            flash("Username or password is incorrect")
            return redirect(url_for("auth.login"))

    return render_template("login.html")


@auth_bp.route("/logout")
def logout():
    auth_token = request.cookies.get("auth_token")
    if auth_token:
        username = "default" #default
        user = UserInfo.find_one({"auth_token": hashlib.sha256(auth_token.encode()).hexdigest()})
        if user:
            username = user.get("username", "unknown")

        # Invalidate server-side session
        UserInfo.update_one(
            {"auth_token": hashlib.sha256(auth_token.encode()).hexdigest()},
            {"$unset": {"auth_token": ""}}
        )

        logger.info(f"Logout successful for username: {username}")

    response = redirect(url_for("auth.login"))
    response.set_cookie("auth_token", "", expires=0)
    return response


def token_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        auth_token = request.cookies.get("auth_token")
        if not auth_token:
            return redirect(url_for("auth.login"))

        user = UserInfo.find_one({"auth_token": auth_token})
        if not user or "token_expire" not in user:
            return redirect(url_for("auth.login"))

        if datetime.utcnow() > user["token_expire"]:
            return redirect(url_for("auth.login"))

        return f(*args, **kwargs)
    return decorated_function

__all__ = ['auth_bp', 'token_required']