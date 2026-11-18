"""Webhook receiver with Flask.

pip install flask "git+https://github.com/bnsware/valorant-api-unofficial#subdirectory=python"
UGIAPI_WEBHOOK_SECRET=whsec_... flask --app webhook_flask run
"""
import os

from flask import Flask, abort, request

from ugiapi import verify_webhook

app = Flask(__name__)
SECRET = os.environ["UGIAPI_WEBHOOK_SECRET"]
seen = set()  # use a database in production


@app.post("/ugi")
def ugi_webhook():
    raw = request.get_data()  # RAW body: never re-encode the JSON before verifying
    if not verify_webhook(SECRET, raw, request.headers.get("X-UGI-Signature"), request.headers.get("X-UGI-Timestamp")):
        abort(401)
    delivery = request.headers.get("X-UGI-Delivery")
    if delivery in seen:  # retries reuse the same delivery id
        return "", 200
    seen.add(delivery)

    event = request.get_json()
    if event["event"] == "match.new":
        m = event["data"]["last_match"]
        print(f"{event['label']}: {'won' if m['won'] else 'lost'} {m['kills']}/{m['deaths']}/{m['assists']}")
    else:
        print(event["event"], event["changes"])
    return "", 200  # answer within 5 seconds
