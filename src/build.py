s=open('app.src.html').read()
m2p=open('lib/m2p/min2phase.js').read()
hdr="/* min2phase.js — Copyright (c) 2023 Chen Shuang, MIT License (dual-licensed MIT/GPLv3) https://github.com/cs0x7f/min2phase.js */\n"
s=s.replace('/*__MIN2PHASE__*/',hdr+m2p).replace('/*__ENGINE__*/',open('engine.js').read()).replace('/*__DEMO__*/',open('demo-data.js').read())
open('out/artifact.html','w').write(s)
full='<!doctype html>\n<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n<style>[hidden]{display:none!important}img{max-width:100%}:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);box-sizing:border-box;height:100%}</style>\n</head><body>\n'+s+'\n</body></html>\n'
open('out/index.html','w').write(full)
print(len(full))
