const { chromium } = await import(process.env.CONTEXT_PLAYWRIGHT_MODULE || 'playwright');
import assert from 'node:assert/strict';
import fs from 'node:fs';
const browser = await chromium.launch({headless:true, ...(process.env.CONTEXT_CHROMIUM_PATH ? {executablePath:process.env.CONTEXT_CHROMIUM_PATH} : {})});
const outputDir = process.env.CONTEXT_QA_OUTPUT || '/tmp/context-browser-qa';
fs.mkdirSync(outputDir,{recursive:true});
const errors=[];
const results=[];
for (const viewport of [{width:1440,height:1100},{width:390,height:844}]) {
 const page=await browser.newPage({viewport});
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.CONTEXT_QA_URL || 'http://127.0.0.1:8097');
 await page.locator('#searchInput').waitFor({state:'visible'});
 await page.waitForFunction(()=>!document.querySelector('#searchInput').disabled);
 for(const [query,title,direction] of [
  ['горячая вода','горячая вода','ru-ms'],
  ['горячей воды','горячая вода','ru-ms'],
  ['air panas','air panas','ms-ru'],
  ['Мне нужна горячая вода сегодня','горячая вода','ru-ms'],
  ['Saya perlukan air panas hari ini','air panas','ms-ru'],
  ['облако','облако','ru-ms'],
 ]) {
  await page.locator('#searchInput').fill(query);
  await page.locator('#searchButton').click();
  await page.waitForFunction(({title,direction})=>document.querySelector('#answerTitle').textContent.toLowerCase()===title && document.querySelector('#directionSwitch .active').dataset.direction===direction,{title,direction});
  if(query!=='облако') {
   assert.equal(await page.locator('#resultList > li').first().locator('.parallel-context mark').count(),2);
   assert.equal(await page.locator('#answerDetails mark').count(),2);
   assert.equal(await page.locator('#resultList > li').first().locator('.result-headword').textContent(),title);
  } else assert.ok((await page.locator('#answerDetails').textContent()).includes('storan awan'));
  results.push({viewport,query,passed:true});
 }
 await page.locator('#searchInput').fill('горячей воды');
 await page.locator('#searchButton').click();
 await page.waitForFunction(()=>document.querySelector('#answerTitle').textContent==='горячая вода');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Horizontal overflow');
 await page.evaluate(()=>scrollTo(0,0));
 await page.screenshot({path:`${outputDir}/${viewport.width}-top.png`,fullPage:false});
 await page.locator('#answerCard').scrollIntoViewIfNeeded();
 await page.screenshot({path:`${outputDir}/${viewport.width}-context.png`,fullPage:false});
 await page.close();
}
// Both packaged profiles must execute with networking disabled.
for(const profile of ['','-Lite']) {
 const file=`${process.env.CONTEXT_OFFLINE_DIR || '/tmp/dictionary-context-offline'}/Malay-Russian-Dictionary-Offline${profile}-v6.18.html`;
 const page=await browser.newPage();
 page.on('pageerror',e=>errors.push(e.message));
 await page.context().setOffline(true);
 await page.goto('file://'+file);
 await page.waitForFunction(()=>!document.querySelector('#searchInput').disabled);
 await page.locator('#searchInput').fill('air panas');
 await page.locator('#searchButton').click();
 await page.waitForFunction(()=>document.querySelector('#answerTitle').textContent==='air panas');
 assert.equal(await page.locator('#answerDetails mark').count(),2);
 results.push({offline:profile||'Full',passed:true});
 await page.close();
}
await browser.close();
assert.deepEqual(errors,[]);
fs.writeFileSync(`${outputDir}/results.json`,JSON.stringify({results,errors},null,2));
console.log(JSON.stringify({browserChecks:results.length,errors}));
