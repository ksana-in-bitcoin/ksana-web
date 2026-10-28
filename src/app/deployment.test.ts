import { describe, expect, it } from 'vitest';
import { deploymentSource, parseDeployment, playgroundHas, playgroundLink } from './deployment';

describe('deployment.json', () => {
  it('names the network a hosted copy starts in', () => {
    const d = parseDeployment({ chain: 'signet', rpc: '/rpc', indexer: '/indexer', btc: '/btc', faucet: '/faucet' });
    expect(d).toEqual({ chain: 'signet', rpc: '/rpc', indexer: '/indexer', btc: '/btc', faucet: '/faucet' });
    expect(deploymentSource(d)).toEqual({ kind: 'rpc', url: '/rpc', chain: 'signet', indexerUrl: '/indexer', btcUrl: '/btc' });
    expect(parseDeployment({ chain: 'devnet', rpc: 'https://node.example/', btc: '' })).toEqual({ chain: 'devnet', rpc: 'https://node.example/' });
  });

  it('anything else is no deployment', () => {
    for (const bad of [null, 'signet', [], {}, { chain: 'signet' }, { chain: 'mainnet', rpc: '/rpc' }, { chain: 'signet', rpc: ' ' }, { chain: 'signet', rpc: 5 }]) {
      expect(parseDeployment(bad)).toBeNull();
    }
    expect(deploymentSource(null)).toBeNull();
  });
});

describe('the contract playground', () => {
  it('is the hosted one on the signet, linked in the page\'s language when it has it', () => {
    expect(parseDeployment({ chain: 'signet', rpc: '/rpc', playground: 'https://play.example/' })).toEqual({ chain: 'signet', rpc: '/rpc', playground: 'https://play.example/' });
    expect(playgroundLink('en')).toBe('https://playground.ksana.network/');
    expect(playgroundLink('zh-CN')).toBe('https://playground.ksana.network/?lang=zh-CN');
    expect(playgroundLink('zh-TW')).toBe('https://playground.ksana.network/');
    const id = 'ab'.repeat(32);
    expect(playgroundLink('en', id)).toBe(`https://playground.ksana.network/#/open?c=${id}`);
    expect(playgroundLink('zh-CN', id)).toBe(`https://playground.ksana.network/?lang=zh-CN#/open?c=${id}`);
    expect(playgroundHas('signet')).toBe(true);
    expect(playgroundHas('devnet')).toBe(false);
  });
});
