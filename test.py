from cgitb import handler
from statistics import pstdev

from flask import Flask, request, jsonify
import logging
from logging.handlers import RotatingFileHandler
import os
import uuid
from Database import UserInfo,MatchHistory
import hashlib
app = Flask(__name__)

# 日志配置（写入 logs/app.log）
if not os.path.exists("logs"):
    os.makedirs("logs")

log_path = "logs/app.log"
file_handler = RotatingFileHandler(log_path, maxBytes=1000000, backupCount=3)
file_handler.setFormatter(logging.Formatter(
    "%(asctime)s - %(levelname)s - %(message)s"
))
app.logger.setLevel(logging.INFO)
app.logger.addHandler(file_handler)

@app.route("/ping")
def ping():
    client_ip = request.remote_addr
    method = request.method
    path = request.path
    app.logger.info(f"Request: {client_ip} {method} {path}")
    return jsonify({"message": "pong from 312Joker backend!"})

@app.route("/GetUserInfo",methods = ["GET"])
def GetUserInfo():
    auth_token = request.headers.get("Auth_Token")
    hash_token = hashlib.sha256(auth_token.encode()).hexdigest()
    userinfo = UserInfo.find_one({"Auth_Token": hash_token}, {"_id": 0})  # Exclude _id from response
    return jsonify(userinfo)

@app.route("/ChangeIcon",methods = ["POST"])
def ChangeIcon():
    MIME_TYPES = {
        "image/jpeg": ".jpg",
        "image/gif": ".gif",
        "image/png": ".png",
    }
    auth_token = request.headers.get("Auth_Token")
    hash_token = hashlib.sha256(auth_token.encode()).hexdigest()
    userid = UserInfo.find_one({"Auth_Token": hash_token}, {"_id": 0})["Userid"]
    types = request.headers.get("Content-Type")
    path = str(userid) + MIME_TYPES[types]
    with open(path, "rb") as f:
        f.write(request.data)
    UserInfo.update_one({"Userid": userid}, {"$set": {"ImgUrl": path}})
    return jsonify({"ImageUrl": path})

@app.route("/GetMatch",methods = ["GET"])
def GetMatch():
    auth_token = request.headers.get("Auth_Token")
    hash_token = hashlib.sha256(auth_token.encode()).hexdigest()
    userid = UserInfo.find_one({"Auth_Token": hash_token}, {"_id": 0})["Userid"]
    MatchH_History = MatchHistory.find({"Userid": userid}, {"_id": 0})
    return jsonify({"Match": MatchH_History})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080)
