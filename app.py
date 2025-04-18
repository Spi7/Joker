from flask import Flask
from Back_End.Profile import GetMatch,GetUserInfo,ChangeIcon
app = Flask(__name__)

@app.route("/")

# Use python -m pip install -r requirements.txt to get start

def home():
    return "Hello World!"

@app.route("/GetUserInfo",methods = ["GET"])
def GetUserInfoPath():
    return GetUserInfo()

@app.route("/ChangeIcon",methods = ["POST"])
def ChangeIconPath():
    return ChangeIcon()

@app.route("/GetMatch",methods = ["GET"])
def GetMatchPath():
    return GetMatch()
