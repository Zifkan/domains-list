import {isIP} from 'node:net';
import {fetchUrlStringWithRetry} from './urls.js';

const metaUrl = 'https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geoip/';
const defaults = {
    telegram: ['https://core.telegram.org/resources/cidr.txt'],
    discord: ['https://raw.githubusercontent.com/sdnv0x4d/ip-lists/master/discord/discord_cidr.txt']
};

export function parsePrefix(value) {
    const parts = value.trim().split('/');
    if (parts.length > 2 || !isIP(parts[0])) throw new Error(`Invalid IP prefix: ${value}`);
    const version = isIP(parts[0]);
    const bits = version === 4 ? 32 : 128;
    if (parts.length === 2 && (!/^\d+$/.test(parts[1]) || +parts[1] > bits)) throw new Error(`Invalid IP prefix: ${value}`);
    const prefix = parts.length === 1 ? bits : +parts[1];
    if (version === 4) {
        const address = parts[0].split('.').reduce((acc, n) => acc * 256 + +n, 0);
        const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
        const network = (address & mask) >>> 0;
        return {version, value: [24, 16, 8, 0].map(shift => (network >>> shift) & 255).join('.') + '/' + prefix};
    }
    return {version, value: `${parts[0].toLowerCase()}/${prefix}`};
}

export function parseText(text) {
    return text.split(/\r?\n/).map(line => line.replace(/#.*/, '').trim()).filter(Boolean).map(parsePrefix);
}

export async function generateIpLists(services, config, fetchText = fetchUrlStringWithRetry) {
    if (config.generateIpFiles === false) return {};
    if (!Array.isArray(services) || services.some(service => typeof service !== 'string')) throw new Error('ipServices must be an array of service names');
    services = [...new Set(services)];
    const ipv4 = new Set(), ipv6 = new Set();
    const add = entries => { for (const item of entries) (item.version === 4 ? ipv4 : ipv6).add(item.value); };
    const extra = config.additionalIpLists || {};
    for (const service of services) {
        if (!/^[a-z0-9][a-z0-9_@.!-]*$/i.test(service)) throw new Error(`Invalid service: ${service}`);
        const url = `${metaUrl}${encodeURIComponent(service)}.json`;
        const json = JSON.parse(await fetchText(url, {noRetryStatusCodes: [404]}));
        if (json.rules !== undefined) {
            if (!Array.isArray(json.rules)) throw new Error(`Invalid GeoIP data: ${url}`);
            for (const rule of json.rules) {
                if (rule.ip_cidr !== undefined && !Array.isArray(rule.ip_cidr)) throw new Error(`Invalid GeoIP data: ${url}`);
                add((rule.ip_cidr || []).map(parsePrefix));
            }
        }
        const urls = [...(defaults[service] || []), ...(extra[service] || [])];
        for (const source of urls) {
            const entries = parseText(await fetchText(source));
            if (!entries.length) throw new Error(`Empty IP source: ${source}`);
            add(entries);
        }
    }
    for (const [service, urls] of Object.entries(extra)) {
        if (services.includes(service)) continue;
        for (const source of urls) {
            const entries = parseText(await fetchText(source));
            if (!entries.length) throw new Error(`Empty IP source: ${source}`);
            add(entries);
        }
    }
    return {
        '_all_in_one_ipv4.lst': [...ipv4].sort().join('\n') + (ipv4.size ? '\n' : ''),
        '_all_in_one_ipv6.lst': [...ipv6].sort().join('\n') + (ipv6.size ? '\n' : '')
    };
}
