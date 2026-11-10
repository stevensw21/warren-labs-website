import {test} from 'node:test'; import assert from 'node:assert/strict'; import {advance,initial} from '../public/projects/quiet-wilds/engine.js';
test('quiet invites one animal after interval',()=>{let s=initial(); for(let i=0;i<10;i++)s=advance(s,10,45,1,10);assert.equal(s.count,1)});
test('brief loud sound does not remove animal',()=>{let s={...initial(),count:2};s=advance(s,90,45,.5,10);assert.equal(s.count,2)});
test('sustained loud noise retreats one animal',()=>{let s={...initial(),count:3};for(let i=0;i<3;i++)s=advance(s,90,45,1,10);assert.equal(s.count,2)});
test('never exceeds capacity or becomes negative',()=>{let s=initial();for(let i=0;i<1000;i++)s=advance(s,0,45,1,1);assert.equal(s.count,12);for(let i=0;i<100;i++)s=advance(s,90,45,1,1);assert.equal(s.count,0)});
test('middle band preserves progress, quiet resets loud accumulation',()=>{let s={...initial(),quiet:4,loud:1};s=advance(s,43,45,1,10);assert.equal(s.quiet,4);s=advance(s,10,45,1,10);assert.equal(s.loud,0)});
