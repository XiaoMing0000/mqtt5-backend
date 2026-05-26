# MQTT5 Backend — TODO

Reference: <https://docs.oasis-open.org/mqtt/mqtt/v5.0/mqtt-v5.0.html>

---

## Remaining Tasks

### Protocol Gaps

- [ ] **User Property duplicate keys and ordering**
  - Current: Object structure overwrites duplicate keys and loses insertion order.
  - Impact: Property pass-through semantics are incorrect per MQTT 5.0 §3.1.2.11.8.
  - Files: `src/interface.ts`, `src/property.ts`, `src/parse.ts`

### QoS Delivery Improvements

- [ ] **Configurable QoS retry interval**
  - Current: `qosRetryIntervalMs` is hardcoded to 5000ms in `Manager`.
  - Suggestion: Expose as `qosRetryIntervalMs` in `IMqttOptions` alongside existing `qosRetryCount`.
  - Files: `src/interface.ts`, `src/index.ts`, `src/manager/manager.ts`

### Testing & Quality

- [ ] **Session recovery e2e tests**
  - Cover `cleanStart=0` reconnection restoring outbound QoS1/QoS2 messages.
  - Cover QoS retry timer triggering and DUP flag on resent PUBLISH.

- [ ] **AUTH e2e tests**
  - Cover full challenge/response flow (CONNECT → AUTH Continue → AUTH Success).
  - Cover re-authentication on established connection.

- [ ] **Shared Subscription e2e tests**
  - Cover `$share/{group}/{filter}` round-robin distribution across multiple subscribers.

- [ ] **Regression suite: unit + e2e + load testing (QoS1/2 long connections)**
  - Establish structured regression checklist.
  - Add load/stress test for QoS1/QoS2 with sustained connections.

### Compliance Verification

- [ ] **Interop testing with standard MQTT clients**
  - Validate against mqtt.js, Paho, EMQX client for key MQTT5 scenarios.

---

## Completed (Summary)

The following have been fully implemented, tested, and verified:

**Protocol Core:**
TCP/TLS/WebSocket/WSS transport; CONNECT/CONNACK/PUBLISH/PUBACK/PUBREC/PUBREL/PUBCOMP/SUBSCRIBE/SUBACK/UNSUBSCRIBE/UNSUBACK/PINGREQ/PINGRESP/DISCONNECT/AUTH packet parsing and encoding; MQTT v3.1/v3.1.1/v5 support.

**Session & QoS:**
Clean Start / Session Present / Session Expiry full semantics; outbound QoS1/QoS2 unacknowledged message store with `cleanStart=0` recovery; QoS retry mechanism with configurable max retry count (`qosRetryCount`); Message Expiry / Will Message Expiry lifecycle; inbound QoS2 deduplication.

**Subscriptions:**
Multi-topic SUBSCRIBE/UNSUBSCRIBE with per-topic reason codes; Shared Subscription (`$share/{group}/{filter}`) parsing and round-robin distribution; Subscription Identifier aggregation for overlapping subscriptions; topic validation (`$`/`#`/`+` rules).

**Authentication:**
Enhanced AUTH challenge/response state machine (Continue/Success); method consistency validation.

**WebSocket:**
`mqtt` subprotocol enforcement; binary frame validation; StreamFramer for TCP/WS frame reassembly (粘包/半包 handling).

**Code Quality:**
English TSDoc comments across all source files; 392 unit tests (7 test suites) covering parse/encode roundtrips, v5.0 spec compliance, stream framing, properties, topic filters, exceptions, and utilities; ESLint passing.
