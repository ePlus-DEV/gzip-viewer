import {describe, expect, it} from 'vitest';
import {checkProduct, compareLanguageShards, parseShard, sampleProducts} from '../lib/cross-test';

describe('cross-test runner', () => {
  it('parses real JSONL without treating an invalid line as a valid product', () => {
    const data = parseShard('{"sku":"1","gtin":"123"}\ninvalid\n{"sku":"2","gtin":"456"}\n');
    expect(data.parsed).toBe(3);
    expect(data.malformed).toBe(1);
    expect(data.records.map(r => r.sku)).toEqual(['1','2']);
  });
  it('detects same-count but different SKU order', () => {
    const en = [{sku:'A', gtin:'1'}, {sku:'B', gtin:'2'}];
    const de = [{sku:'B', gtin:'2'}, {sku:'A', gtin:'1'}];
    const diff = compareLanguageShards(en, de);
    expect(diff.countSame).toBe(true);
    expect(diff.orderSame).toBe(false);
    expect(diff.orderMismatches).toBe(2);
  });
  it('ignores translated title while comparing invariant fields', () => {
    const en = [{sku:'A', gtin:'1', title:'Mask', price:{value:'22.00', currency:'EUR'}}];
    const de = [{sku:'A', gtin:'1', title:'Maske', price:{value:22, currency:'EUR'}}];
    const diff = compareLanguageShards(en, de);
    expect(diff.orderSame).toBe(true);
    expect(diff.invariantSame).toBe(true);
  });
  it('detects changed price and GTIN', () => {
    const en = [{sku:'A', gtin:'1', price:{value:'22.00',currency:'EUR'}}];
    const de = [{sku:'A', gtin:'2', price:{value:'21.00',currency:'EUR'}}];
    const diff = compareLanguageShards(en, de);
    expect(diff.dataMismatches).toBe(2);
  });
  it('checks single-product JSON and deterministic sampling', () => {
    expect(checkProduct({sku:'1', title:'Helmet', price:{value:'1',currency:'EUR'}},
      {sku:'1', title:'Helm', price:{value:'2',currency:'EUR'}}).length).toBe(2);
    expect(sampleProducts([{sku:1},{sku:2},{sku:3},{sku:4},{sku:5}],3)
      .map(x=>x.sku)).toEqual([1,3,5]);
  });
});
