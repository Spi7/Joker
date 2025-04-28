import json
import sys
import os

from pymongo import MongoClient

docker_db = os.environ.get('DOCKER_DB', "false")

if docker_db == "true":
    print("using docker compose db")
    mongo_client = MongoClient("mongodb://mongo:27017/")
else:
    print("using local db")
    mongo_client = MongoClient("mongodb://localhost:27017/")


db = mongo_client["Joker"]

UserInfo = db["UserInfo"]
MatchHistory = db["MatchHistory"]
RoomCollection = db["Rooms"]