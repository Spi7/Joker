from flask import Flask, render_template, request, redirect, url_for, session,jsonify, flash
import hashlib

from pymongo.synchronous.database import Database

from Database import UserInfo,MatchHistory

def GetUserInfo():
    auth_token = request.headers.get("auth_token")
    hash_token = hashlib.sha256(auth_token.encode()).hexdigest()
    userinfo = UserInfo.find_one({"auth_token": hash_token}, {"_id": 0})  # Exclude _id from response
    return jsonify(userinfo)

def ChangeIcon():
    MIME_TYPES = {
        "image/jpeg": ".jpg",
        "image/gif": ".gif",
        "image/png": ".png",
    }
    auth_token = request.headers.get("auth_token")
    hash_token = hashlib.sha256(auth_token.encode()).hexdigest()
    userid = UserInfo.find_one({"auth_token": hash_token}, {"_id": 0})["user_id"]
    types = request.headers.get("Content-Type")
    path = str(userid) + MIME_TYPES[types]
    with open(path, "rb") as f:
        f.write(request.data)
    UserInfo.update_one({"user_id": userid}, {"$set": {"ImgUrl": path}})
    return jsonify({"ImageUrl": path})

def GetMatch():
    auth_token = request.headers.get("auth_token")
    hash_token = hashlib.sha256(auth_token.encode()).hexdigest()
    userid = UserInfo.find_one({"auth_token": hash_token}, {"_id": 0})["user_id"]
    MatchH_History = MatchHistory.find({"user_id": userid}, {"_id": 0})
    return jsonify({"Match": MatchH_History})
