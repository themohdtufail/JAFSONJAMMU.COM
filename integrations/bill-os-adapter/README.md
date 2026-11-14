# Bill OS adapter (reference)

What the Bill OS side must do to talk to JAFSON Commerce (spec section 4). This package is the reference implementation of that contract; Bill OS itself is a separate Windows application and is not in this repository.

1. For every completed sale, return, stock receipt, adjustment, transfer, and for each stock count, build an event (`@jafson/validation`, schema_version 1) with a **new UUID event_id** and call `outbox.enqueue(event)`. This writes to a local SQLite file first; nothing is lost if the network is down.
2. Run `flush(outbox, client.sendEvents)` on a timer (every few seconds). Failures back off exponentially (2 s, 4 s ... 15 min) and always resend the **same event_id**.
3. Call `client.heartbeat()` periodically. If the showroom goes silent, the website holds back extra units of stock until it reports again.
4. Show `outbox.stats()` on screen: `pending` means offline or retrying, `rejected` means a person must fix something (for example an unknown SKU) and then `outbox.requeue(eventId)`.
5. After reconnecting, submit a `STOCK_SNAPSHOT_SUBMITTED` event; differences are reported to the back-office and never applied automatically.

Endpoints (Bearer `BILL_OS_API_KEY`): `POST /v1/integrations/bill-os/events` (batch up to 100), `POST .../heartbeat`, `POST .../snapshots`, `GET .../events/status`.
The adapter never reads or writes the commerce database and the commerce backend never reads Bill OS's SQLite file.
