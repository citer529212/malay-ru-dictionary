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
 await page.locator('#searchInput').fill('вода');
 await page.locator('#searchButton').click();
 await page.waitForFunction(()=>document.querySelector('#answerTitle').textContent==='вода');
 await page.locator('#contextMode').selectOption('context');
 assert.ok(await page.locator('.parallel-context').count() > 0);
 assert.equal(await page.locator('#resultList > li').count(), await page.locator('.parallel-context').count());
 assert.ok((await page.locator('#resultList').textContent()).includes('горячая вода'));
 await page.locator('#contextTopic').selectOption('еда');
 assert.equal(await page.locator('#answerTitle').textContent(),'вода');
 assert.ok(await page.locator('#resultList > li').count() > 0);
 await page.locator('#contextTopic').selectOption('одежда');
 assert.equal(await page.locator('.parallel-context').count(),0);
 assert.equal(await page.locator('#answerTitle').textContent(),'вода');
 await page.locator('#resetContextFilters').click();
 assert.equal(await page.locator('#contextMode').inputValue(),'all');
 assert.equal(await page.locator('#contextTopic').inputValue(),'');
 results.push({viewport,scenario:'related-word-topics-and-reset',passed:true});
 await page.locator('#searchInput').fill('номер комнаты');
 await page.locator('#searchButton').click();
 await page.waitForFunction(()=>document.querySelector('#answerTitle').textContent==='номер комнаты');
 assert.equal(await page.locator('#answerDetails mark').count(),4);
 const firstResult=page.locator('#resultList > li').first();
 assert.equal(await firstResult.locator('.parallel-context mark').count(),4);
 await firstResult.locator('details summary').click();
 assert.ok(await firstResult.locator('details').evaluate(element=>element.open));
 assert.ok((await firstResult.locator('details').textContent()).includes('Предоставленная проверенная статья'));
 results.push({viewport,scenario:'two-contexts-and-source-disclosure',passed:true});
 await page.locator('#contextMode').selectOption('context');
 await page.locator('#searchInput').fill('air');
 await page.locator('#searchButton').click();
 await page.waitForFunction(()=>document.querySelector('#answerTitle').textContent==='air');
 assert.ok((await page.locator('#resultList').textContent()).includes('air panas'));
 results.push({viewport,scenario:'related-malay-word',passed:true});
 for (const [exampleQuery,expectedTitle] of [['застрял','замочная скважина'],['tersangkut','lubang kunci']]) {
  await page.locator('#searchInput').fill(exampleQuery);
  await page.locator('#searchButton').click();
  await page.waitForFunction(expected=>Array.from(document.querySelectorAll('#resultList .result-headword')).some(element=>element.textContent===expected),expectedTitle);
  const exampleResult=page.locator('#resultList > li').filter({has:page.locator('.result-headword',{hasText:expectedTitle})}).first();
  assert.ok((await exampleResult.locator('.result-type').textContent()).includes('совпадение в примере'));
  assert.ok((await exampleResult.locator('.parallel-context mark').allTextContents()).some(text=>text.toLowerCase()===exampleQuery));
  assert.ok(await exampleResult.locator('.parallel-context mark').count()>=3);
  results.push({viewport,scenario:'example-search-'+exampleQuery,passed:true});
 }
 await page.locator('#searchInput').fill('Я забыл номер комнаты.');
 await page.locator('#searchButton').click();
 await page.waitForFunction(()=>document.querySelector('#answerTitle').textContent==='номер комнаты');
 assert.equal(await page.locator('#answerDetails .sense-example').first().textContent(),'Я забыл номер комнаты.');
 assert.equal(await page.locator('#answerDetails .sense-example mark').first().textContent(),'номер комнаты');
 assert.equal(await page.locator('#answerDetails .sense-example-translation').first().textContent(),'Saya terlupa nombor bilik.');
 results.push({viewport,scenario:'matching-example-ordered-first',passed:true});
 await page.locator('#searchInput').fill('станция пересадки');
 await page.locator('#searchButton').click();
 await page.waitForFunction(()=>document.querySelector('#answerTitle').textContent==='станция пересадки');
 assert.equal(await page.locator('#answerDetails mark').count(),4);
 results.push({viewport,scenario:'new-batch-contexts',passed:true});
 await page.locator('#searchInput').fill('tersangkut');
 await page.locator('#searchButton').click();
 await page.waitForFunction(()=>document.querySelector('#resultList .result-headword')?.textContent==='lubang kunci');
 await page.locator('.context-filters').scrollIntoViewIfNeeded();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Horizontal overflow in example results');
 await page.screenshot({path:`${outputDir}/${viewport.width}-example-search.png`,fullPage:false});
 await page.locator('#resultList > li').first().scrollIntoViewIfNeeded();
 await page.screenshot({path:`${outputDir}/${viewport.width}-example-detail.png`,fullPage:false});
 await page.locator('#resetContextFilters').click();
 await page.locator('#searchInput').fill('номер комнаты');
 await page.locator('#searchButton').click();
 await page.waitForFunction(()=>document.querySelector('#answerTitle').textContent==='номер комнаты');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Horizontal overflow');
 await page.evaluate(()=>scrollTo(0,0));
 await page.screenshot({path:`${outputDir}/${viewport.width}-top.png`,fullPage:false});
 await page.locator('#answerCard').scrollIntoViewIfNeeded();
 await page.screenshot({path:`${outputDir}/${viewport.width}-context.png`,fullPage:false});
 await page.locator('.context-filters').scrollIntoViewIfNeeded();
 await page.screenshot({path:`${outputDir}/${viewport.width}-filters.png`,fullPage:false});
 await page.locator('#resultList > li').first().locator('details summary').click();
 assert.ok(await page.locator('#resultList > li').first().locator('details').evaluate(element=>element.open));
 await page.locator('#resultList > li').first().scrollIntoViewIfNeeded();
 await page.screenshot({path:`${outputDir}/${viewport.width}-source.png`,fullPage:false});
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
 await page.locator('#searchInput').fill('номер комнаты');
 await page.locator('#searchButton').click();
 await page.waitForFunction(()=>document.querySelector('#answerTitle').textContent==='номер комнаты');
 assert.equal(await page.locator('#answerDetails mark').count(),4);
 await page.locator('#contextMode').selectOption('context');
 await page.locator('#searchInput').fill('вода');
 await page.locator('#searchButton').click();
 await page.waitForFunction(()=>document.querySelector('#answerTitle').textContent==='вода');
 assert.ok((await page.locator('#resultList').textContent()).includes('горячая вода'));
 await page.locator('#searchInput').fill('застрял');
 await page.locator('#searchButton').click();
 await page.waitForFunction(()=>document.querySelector('#resultList .result-headword')?.textContent==='замочная скважина');
 assert.ok((await page.locator('#resultList .parallel-context mark').allTextContents()).includes('застрял'));
 results.push({offline:profile||'Full',passed:true});
 await page.close();
}
await browser.close();
assert.deepEqual(errors,[]);
fs.writeFileSync(`${outputDir}/results.json`,JSON.stringify({results,errors},null,2));
console.log(JSON.stringify({browserChecks:results.length,errors}));
