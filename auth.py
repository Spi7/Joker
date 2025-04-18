# auth.py
from flask import Blueprint, request, redirect, render_template, session, url_for, flash
from Database import UserInfo
import hashlib
import os

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

        if UserInfo.find_one({"username": username}):
            flash("Username already exists")
            return redirect(url_for("auth.register"))

        # Hash the password before storing
        hashed_password = hash_password(password)
        UserInfo.insert_one({"username": username, "password": hashed_password})
        flash("Signup successful, please log in")
        return redirect(url_for("auth.login"))

    return render_template("register.html")

@auth_bp.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form["username"]
        password = request.form["password"]

        user = UserInfo.find_one({"username": username})
        if user and verify_password(user["password"], password):
            session["username"] = username
            return redirect(url_for("home"))
        else:
            flash("Username or password is incorrect")
            return redirect(url_for("auth.login"))

    return render_template("login.html")

@auth_bp.route("/logout")
def logout():
    session.pop("username", None)
    return redirect(url_for("auth.login"))