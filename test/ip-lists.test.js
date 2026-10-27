import test from 'node:test';
import assert from 'node:assert/strict';
import {generateIpLists, parsePrefix, parseText} from '../ip-lists.js';

test('validates and normalizes prefixes', () => {
    assert.deepEqual(parsePrefix('149.154.163.7/20'), {version: 4, value: '149.154.160.0/20'});
    assert.equal(parsePrefix('1.2.3.4').value, '1.2.3.4/32');
    assert.equal(parsePrefix('2001:db8::1').value, '2001:db8::1/128');
    for (const value of ['1.2.3.999/24', '1.2.3.4/33', '1.2.3.4/-1', '0.0.0.0/0;foo', 'example.com']) {
        assert.throws(() => parsePrefix(value));
    }
    assert.equal(parseText('# comment\n1.2.3.4 # comment\n').length, 1);
});

test('combines GeoIP, official, and additional sources; removes duplicates', async () => {
    const fetcher = async url => url.includes('/geo/geoip/')
        ? JSON.stringify({rules: [{ip_cidr: ['149.154.160.1/20', '2001:db8::/32']}]})
        : url.includes('cidr.txt') ? '149.154.160.0/20\n2001:db8::/32\n' : '1.2.3.4\n';
    const result = await generateIpLists(['telegram'], {additionalIpLists: {custom: ['https://example.test/ip']}}, fetcher);
    assert.equal(result['_all_in_one_ipv4.lst'], '1.2.3.4/32\n149.154.160.0/20\n');
    assert.equal(result['_all_in_one_ipv6.lst'], '2001:db8::/32\n');
});

test('fails on bad or unavailable explicit sources', async () => {
    await assert.rejects(generateIpLists([], {additionalIpLists: {x: ['https://example.test']}}, async () => 'bad-data'));
    await assert.rejects(generateIpLists([], {additionalIpLists: {x: ['https://example.test']}}, async () => {throw new Error('offline')}));
    assert.deepEqual(await generateIpLists([], {generateIpFiles: false}), {});
});
