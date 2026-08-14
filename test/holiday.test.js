const test = require('node:test');
const assert = require('node:assert');

const holidayNode = require('../holiday.js');

// Minimal stand-in for the Node-RED runtime: build a node, feed it one msg,
// return [matchOutput, noMatchOutput].
function run(config, payload) {
    var node = { sent: null };
    var RED = {
        nodes: {
            createNode: function () { },
            registerType: function (_, ctor) { RED.ctor = ctor; }
        }
    };
    holidayNode(RED);

    node.on = function (_, handler) { node.handler = handler; };
    node.send = function (out) { node.sent = out; };
    RED.ctor.call(node, config);

    node.handler({ payload: payload });
    return node.sent;
}

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
const utc = (y, m, d) => new Date(Date.UTC(y, m - 1, d, 16));

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

test('an ordinary weekday goes out the second output', () => {
    const [match, noMatch] = run(US, utc(2025, 3, 4)); // Tuesday, nothing special
    assert.equal(match, null);
    assert.equal(noMatch.holiday, undefined);
});

test('a plain Saturday is a weekend but not a holiday', () => {
    // Local noon so getDay() is the same day whatever timezone the test runs in.
    const [match, noMatch] = run(US, new Date(2025, 5, 21, 12));
    assert.equal(noMatch, null);
    assert.equal(match.weekend, true);
    assert.equal(match.holiday, undefined);
});

test('weekend days are configurable', () => {
    const [match, noMatch] = run({ ...US, weekend: '5' }, new Date(2025, 5, 21, 12));
    assert.equal(match, null);
    assert.ok(noMatch);
});
