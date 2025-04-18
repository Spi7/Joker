from flask import Flask, render_template, session, redirect, url_for
from auth import auth_bp
import os

app = Flask(__name__, static_folder='frontend/static', template_folder='frontend/templates')
app.secret_key = os.environ.get('SECRET_KEY', 'dev_key_replace_in_production')

# Register the auth blueprint
app.register_blueprint(auth_bp, url_prefix="/auth")

@app.route("/")
def home():
    if "username" in session:
        return f"Welcome, {session['username']}!"
    return redirect(url_for("auth.login"))

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080)