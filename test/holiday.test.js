const test = require('node:test');
const assert = require('node:assert');

const holidayNode = require('../holiday.js');

// Minimal stand-in for the Node-RED runtime: enough of it to register a node
// type and an admin endpoint.
function runtime() {
    var RED = {
        nodes: {
            createNode: function () { },
            registerType: function (_, ctor) { RED.ctor = ctor; }
        },
        auth: { needsPermission: function () { } },
        httpAdmin: { get: function (_path, _perm, handler) { RED.route = handler; } }
    };
    return RED;
}

// Calls the editor's /holiday/places endpoint and hands back the JSON body.
function places(query) {
    var RED = runtime();
    holidayNode(RED);

    var body;
    RED.route({ query: query }, { json: function (b) { body = b; } });
    return body;
}

// Minimal stand-in for the Node-RED runtime. Builds a node, feeds it the
// payloads, and reports what came back out.
function build(config) {
    var node = { sent: null, status: null, errors: [] };
    var RED = runtime();
    holidayNode(RED);

    node.on = function (_, handler) { node.handler = handler; };
    node.send = function (out) { node.sent = out; };
    node.status = function (s) { node.status.last = s; };
    node.error = function (e) { node.errors.push(e); };
    RED.ctor.call(node, config);

    node.input = function (payload) {
        node.sent = [null, null];
        node.handler({ payload: payload });
        return node.sent;
    };
    return node;
}

const run = (config, payload) => build(config).input(payload);

const US = {
    country: 'US',
    state: 'TX',
    region: '',
    languages: 'en',
    typePublic: true,
    typeBank: true,
    typeObservance: true,
    weekend: '6,0'
};

// 16:00 UTC is mid-day in the US regardless of the machine's own timezone.
const utc = (y, m, d, h = 16) => new Date(Date.UTC(y, m - 1, d, h));

test('Juneteenth is a holiday (issue #5)', () => {
    const [match, noMatch] = run(US, utc(2025, 6, 19));
    assert.equal(noMatch, null);
    assert.equal(match.holiday.name, 'Juneteenth');
    assert.equal(match.holiday.type, 'public');
    assert.equal(match.weekend, undefined);
});

test('all matches for a date are kept, not just the first', () => {
    const [match] = run(US, utc(2025, 6, 19));
    assert.ok(Array.isArray(match.holidays));
    assert.ok(match.holidays.some(h => h.name === 'Emancipation Day In Texas'));
});

test('unselected holiday types are filtered out', () => {
    const [match] = run({ ...US, typeObservance: false }, utc(2025, 6, 19));
    assert.deepEqual(match.holidays.map(h => h.type), ['public']);
});

test('selecting no types at all means every type', () => {
    const none = { ...US, typePublic: false, typeBank: false, typeObservance: false };
    const [match] = run(none, utc(2025, 2, 14)); // Valentine's Day, an observance
    assert.equal(match.holiday.type, 'observance');
});

test('an ordinary weekday goes out the second output', () => {
    const [match, noMatch] = run(US, utc(2025, 3, 4)); // Tuesday, nothing special
    assert.equal(match, null);
    assert.equal(noMatch.holiday, undefined);
});

test('a plain Saturday is a weekend but not a holiday', () => {
    const [match, noMatch] = run(US, utc(2025, 6, 21));
    assert.equal(noMatch, null);
    assert.equal(match.weekend, true);
    assert.equal(match.holiday, undefined);
});

test('weekend days are configurable', () => {
    const [match, noMatch] = run({ ...US, weekend: '5' }, utc(2025, 6, 21));
    assert.equal(match, null);
    assert.ok(noMatch);
});

test('the weekday is read in the holiday timezone, not the server one', () => {
    // 02:00 UTC on Saturday is still Friday evening in New York.
    const friday = utc(2025, 6, 21, 2);
    assert.equal(run(US, friday)[0], null);
    assert.ok(run({ ...US, timezone: 'UTC' }, friday)[0].weekend);
});

test('an explicit timezone moves the holiday boundary too', () => {
    // Midnight UTC on 4 July is still 3 July in the US.
    const midnight = utc(2025, 7, 4, 0);
    assert.equal(run(US, midnight)[0], null);
    assert.equal(run({ ...US, timezone: 'UTC' }, midnight)[0].holiday.name, 'Independence Day');
});

test('an unknown country errors instead of never matching', () => {
    const node = build({ ...US, country: 'XX' });
    assert.match(node.errors[0], /Unknown country/);
    assert.equal(node.status.last.fill, 'red');
    assert.equal(node.handler, undefined, 'should not accept input');
});

test('an unknown timezone errors', () => {
    const node = build({ ...US, timezone: 'Mars/Olympus_Mons' });
    assert.match(node.errors[0], /Unknown timezone/);
    assert.equal(node.status.last.fill, 'red');
});

test('a payload that is not a date errors instead of reporting "no holiday"', () => {
    const node = build(US);
    const [match, noMatch] = node.input('not a date');
    assert.equal(match, null);
    assert.equal(noMatch, null);
    assert.match(node.errors[0], /not a date/);
});

test('status shows what matched', () => {
    const node = build(US);
    node.input(utc(2025, 6, 19));
    assert.equal(node.status.last.text, 'Juneteenth');
    node.input(utc(2025, 6, 21));
    assert.equal(node.status.last.text, 'weekend');
    node.input(utc(2025, 3, 4));
    assert.deepEqual(node.status.last, {});
});

test('the editor is offered every country, named in English', () => {
    const countries = places({});
    assert.ok(Object.keys(countries).length > 100);
    assert.equal(countries.US, 'United States of America');
    assert.equal(countries.DE, 'Germany'); // not "Deutschland"
});

test('a country with states is offered them', () => {
    const states = places({ country: 'US' });
    assert.equal(states.TX, 'Texas');
});

test('a country without states is offered an empty list, not undefined', () => {
    assert.deepEqual(places({ country: 'NO' }), {});
});

test('a state with regions is offered them', () => {
    const regions = places({ country: 'DE', state: 'BY' });
    assert.ok(Object.keys(regions).length > 0);
});

test('an unknown country is an empty list rather than an error', () => {
    assert.deepEqual(places({ country: 'ZZ' }), {});
    assert.deepEqual(places({ country: 'ZZ', state: 'YY' }), {});
});
