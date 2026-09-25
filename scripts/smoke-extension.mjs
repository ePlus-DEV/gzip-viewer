import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp, rm, mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {chromium} from 'playwright';

const extension = resolve('.output/chrome-mv3');
const sites = {origin: ''};
const requestCounts = new Map();
function hits(pathname) { return requestCounts.get(pathname) ?? 0; }
const changed = new Date().toISOString();
/** Detect text colliding with the absolutely positioned icon in the shared input. */
async function assertIconDoesNotOverlap(page, inputRootSelector, name) {
  const metrics=await page.locator(inputRootSelector).evaluate(root=>{
    const icon=root.querySelector('svg');
    const input=root.querySelector('input');
    if(!icon || !input)throw new Error('Input or icon not found');
    const iconRect=icon.getBoundingClientRect();
    const inputRect=input.getBoundingClientRect();
    return {
      iconRight:iconRect.right,
      textStart:inputRect.left+parseFloat(getComputedStyle(input).paddingLeft),
      iconHeight:iconRect.height,
      fieldHeight:inputRect.height,
      iconY:iconRect.top+iconRect.height/2,
      fieldY:inputRect.top+inputRect.height/2,
    };
  });
  assert.ok(metrics.textStart >= metrics.iconRight+7,
    name+': icon overlaps input text ('+JSON.stringify(metrics)+')');
  assert.ok(Math.abs(metrics.iconY-metrics.fieldY)<=3,
    name+': icon is not vertically centered ('+JSON.stringify(metrics)+')');
}
const product = {
  id: 101, sku: '101', mpn: 'ABC', gtin: '1234567890128',
  title: 'Test item', description: 'Fixture product', brand: 'Example',
  category: 'Motorcycle Parts',
  availability: 'in_stock', inventory_quantity: 12,
  image_link: '/img.png', price: {value: '11.00', currency: 'EUR'},
  is_eligible_search: true, is_eligible_checkout: true,
};
const body = (pathname) => {
  const origin = sites.origin;
  const item = {...product, url: origin + '/en/product/test-item'};
  switch (pathname) {
    case '/llms.txt':
      return ['text/plain', '# Test Website\n## Product feeds\n- [Products](' + origin + '/feeds/products.json)\n'];
    case '/agents.md':
      return ['text/markdown', '# Agents\n[Product feed](' + origin + '/feeds/products.json)\n'];
    case '/feeds/products.json':
      return ['application/json', JSON.stringify({
        version: '1.0',
        catalog_info: {title:'Test feed', total_products:1, total_shards:1,
          supported_languages:['en']},
        shards: [{language:'en', url:origin+'/feeds/products-en-1.jsonl.gz',
          last_modified:changed}],
      })];
    case '/feeds/products-en-1.jsonl.gz':
      return ['application/x-ndjson', JSON.stringify(item)+'\n'];
    case '/en/products/101.json':
      return ['application/json', JSON.stringify(item)];
    case '/robots.txt':
      return ['text/plain', 'User-agent: *\nAllow: /\nSitemap: '+origin+'/sitemap.xml\n'];
    case '/sitemap.xml':
      return ['application/xml',
        '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+
        '<url><loc>'+origin+'/en/product/test-item</loc></url></urlset>'];
    case '/en/product/test-item':
      return ['text/html', '<!doctype html><html lang="en"><head><title>Test item</title>'+
        '<meta name="description" content="Test product">'+
        '<link rel="canonical" href="'+origin+'/en/product/test-item">'+
        '<script type="application/ld+json">'+JSON.stringify({
          '@context':'https://schema.org','@type':'Product',name:'Test item',
          sku:'101',gtin13:'1234567890128',image:origin+'/img.png',
          offers:{'@type':'Offer',price:'11.00',priceCurrency:'EUR'},
        })+'</script></head><body><h1>Test item</h1></body></html>'];
    default: return ['text/plain','Missing fixture'];
  }
};
const server = createServer((request,response)=>{
  const pathname = new URL(request.url||'/',sites.origin||'http://localhost').pathname;
  requestCounts.set(pathname, hits(pathname)+1);
  const [type,content]=body(pathname);
  response.writeHead(content==='Missing fixture'?404:200,{'content-type':type});
  response.end(content);
});
let context;
let profile;
try {
  await new Promise((resolvePromise,reject) => {
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolvePromise);
  });
  sites.origin='http://127.0.0.1:'+server.address().port;

  profile=await mkdtemp(join(tmpdir(),'seo-aeo-ext-smoke-'));
  context=await chromium.launchPersistentContext(profile,{
    headless:true,channel:'chromium',
    args:[
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-extensions-except='+extension,
      '--load-extension='+extension,
      '--no-first-run',
    ],
  });
  const sw=context.serviceWorkers()[0] || await context.waitForEvent('serviceworker',{timeout:30000});
  const id=new URL(sw.url()).hostname;
  assert.match(id,/^[a-p]{32}$/);
  await mkdir('artifacts',{recursive:true});
  const exceptions=[];
  context.on('page',tab=>tab.on('pageerror',error=>exceptions.push('early: '+(error.stack||error.message))));
  const popup=await context.newPage();
  popup.on('pageerror',error=>exceptions.push('popup: '+(error.stack||error.message)));
  await popup.setViewportSize({width:460,height:840});
  await popup.goto('chrome-extension://'+id+'/popup.html',{waitUntil:'networkidle'});
  await popup.locator('#site').fill(sites.origin+'/feeds/products.json');
  await popup.locator('#site').blur();
  assert.equal(await popup.locator('#site').inputValue(),sites.origin+'/llms.txt',
    'AEO popup target must visibly match the full runner entry point.');
  await assertIconDoesNotOverlap(popup,'.popup-site-input','Popup target URL');
  await popup.screenshot({path:'artifacts/popup.png',fullPage:true});
  const newTab=context.waitForEvent('page',{timeout:25000});
  await popup.getByRole('button',{name:/Run AEO Tests/i}).click();
  const page=await newTab;
  await page.waitForURL(/chrome-extension:\/\/[^/]+\/test-runner\.html/,{timeout:20000});
  await page.setViewportSize({width:1440,height:1000});
  page.on('pageerror',error=>exceptions.push(error.stack||error.message));
  page.on('console',message=>{if(message.type()==='error')exceptions.push('console: '+message.text());});
  await page.locator('#run').waitFor({state:'visible'});
  await assertIconDoesNotOverlap(page,'.audit-site-input','Audit target URL');
  await assertIconDoesNotOverlap(page,'.results-search','Audit findings search');
  assert.equal(new URL(page.url()).searchParams.get('mode'),'aeo',
    'Popup must open the selected audit mode.');
  assert.equal(new URL(page.url()).searchParams.get('scope'),'quick',
    'Popup must preserve the requested test scope.');
  assert.equal(await page.locator('#site').inputValue(),sites.origin+'/llms.txt',
    'Popup and full runner must display the same AEO target.');
  console.log('Popup smoke PASS: Run AEO Tests opens the real audit runner.');
  await page.screenshot({path:'artifacts/audit-dashboard.png',fullPage:true});
  // A single popup click must START AND FINISH the audit, with no second click.
  // A run request must be consumed so refresh does not trigger more HTTP scans.
  try {
    await page.waitForFunction(()=>
      document.querySelector('#activity')?.textContent?.includes('Finished.'),
      undefined,{timeout:16000},
    );
  } catch (error) {
    console.log('Audit diagnostic', JSON.stringify({
      url:page.url(),
      site:await page.locator('#site').inputValue(),
      activity:await page.locator('#activity').innerText(),
      runEnabled:await page.locator('#run').isEnabled(),
      counts:{llms:hits('/llms.txt'),robots:hits('/robots.txt')},
      pageErrors:exceptions,
      startupError:await page.locator('.startup-error').allInnerTexts(),
      timing:await page.locator('#elapsed').innerText(),
    }));
    await page.screenshot({path:'artifacts/autorun-debug.png',fullPage:true});
    throw error;
  }
  assert.equal(await page.locator('#run').isEnabled(),true,'AEO Run should re-enable on completion.');
  assert.equal(new URL(page.url()).searchParams.has('autorun'),false,
    'The one-shot launch flag must be consumed before the audit begins.');
  assert.equal(hits('/llms.txt'),1,'One popup click must start exactly one AEO scan.');
  const pass=Number(await page.locator('#passed').innerText());
  assert.ok(pass>=3,'AEO must execute real HTTP/data checks, not just display the UI.');
  assert.match(await page.locator('#elapsed').innerText(),/^\d\d:\d\d:\d\d$/,'Timing must show elapsed duration.');
  console.log('AEO smoke PASS: '+pass+' live checks.');
  // The live stream must default to newest-first, independently of severity.
  const sort=page.locator('#result-sort');
  assert.equal(await sort.inputValue(),'newest','Newest-first must be the default.');
  const newest=await page.locator('#findings .id').allTextContents();
  assert.ok(newest.length>=4,'Smoke fixture should produce several sortable results.');
  await sort.selectOption('oldest');
  await page.waitForFunction(first=>
    document.querySelector('#findings .id')?.textContent!==first,
    newest[0],
  );
  const oldest=await page.locator('#findings .id').allTextContents();
  assert.deepEqual(oldest,[...newest].reverse(),
    'Oldest first must show the reverse of the original live event order.');
  await sort.selectOption('severity');
  const severityOrder=await page.locator('#findings .status').allTextContents();
  const severityRank={FAIL:0,BLOCKED:1,WARNING:2,'NOT-RUN':3,PASS:4};
  for(let i=1;i<severityOrder.length;i++){
    assert.ok(severityRank[severityOrder[i-1]]<=severityRank[severityOrder[i]],
      'Failures first must group findings by severity.');
  }
  await sort.selectOption('newest');
  await page.screenshot({path:'artifacts/aeo-results.png',fullPage:true});

  await page.reload({waitUntil:'networkidle'});
  assert.match(await page.locator('#activity').innerText(),/Ready\. Choose a mode/,
    'Refreshing a completed audit must return to idle, not repeat a scan.');
  assert.equal(hits('/llms.txt'),1,'Refreshing the results tab must NOT rerun AEO.');
  // The same runner must still allow the user to explicitly start again.
  await page.locator('#run').click();
  await page.waitForFunction(()=>
    document.querySelector('#activity')?.textContent?.includes('Finished.'),
    undefined,{timeout:90000},
  );
  assert.equal(hits('/llms.txt'),2,'The manually triggered rerun must execute once.');
  console.log('Manual rerun smoke PASS: no refresh loop and Run remains functional.');

  // Select SEO in a fresh popup: the new SEO tab must start without another click.
  const seoPopup=await context.newPage();
  await seoPopup.goto('chrome-extension://'+id+'/popup.html',{waitUntil:'networkidle'});
  await seoPopup.locator('#site').fill(sites.origin+'/en/product/test-item');
  await seoPopup.getByRole('radio',{name:/SEO Audit/i}).click();
  assert.equal(await seoPopup.locator('#site').inputValue(),sites.origin+'/robots.txt',
    'Switching to SEO must immediately normalize the popup target to robots.txt.');
  const seoTabPromise=context.waitForEvent('page',{timeout:25000});
  await seoPopup.getByRole('button',{name:/Run SEO Tests/i}).click();
  const seoPage=await seoTabPromise;
  await seoPage.waitForURL(url => url.protocol === 'chrome-extension:' && url.pathname === '/test-runner.html', {timeout:20000});
  seoPage.on('pageerror',error=>exceptions.push('SEO: '+(error.stack||error.message)));
  assert.equal(new URL(seoPage.url()).searchParams.get('mode'),'seo');
  await seoPage.waitForFunction(()=>
    document.querySelector('#activity')?.textContent?.includes('Finished.'),
    undefined,{timeout:90000},
  );
  assert.equal(await seoPage.locator('#run').isEnabled(),true,'SEO Run must re-enable on completion.');
  assert.equal(new URL(seoPage.url()).searchParams.has('autorun'),false);
  assert.equal(hits('/robots.txt'),1,'One popup click must start exactly one SEO scan.');
  const seoPass=Number(await seoPage.locator('#passed').innerText());
  assert.ok(seoPass>=3,'SEO must crawl a real XML sitemap and page.');
  console.log('SEO autorun smoke PASS: '+seoPass+' live checks.');
  await seoPage.screenshot({path:'artifacts/seo-results.png',fullPage:true});

  // A deep-linked XML resource has no ancestors, so Back and Home are disabled;
  // Dashboard must ALWAYS return to the main audit page without a new scan.
  const viewer=await context.newPage();
  viewer.on('pageerror',error=>exceptions.push('Viewer: '+(error.stack||error.message)));
  await viewer.setViewportSize({width:1440,height:1000});
  const viewerUrl='chrome-extension://'+id+'/viewer.html?url='+
    encodeURIComponent(sites.origin+'/sitemap.xml');
  await viewer.goto(viewerUrl,{waitUntil:'networkidle'});
  assert.equal(await viewer.locator('#home').isDisabled(),true,
    'The first resource has no ancestor; resource Home may be disabled.');
  assert.equal(await viewer.locator('#dashboard').isEnabled(),true,
    'The main Dashboard button must ALWAYS work for a direct resource URL.');
  await assertIconDoesNotOverlap(viewer,'.viewer-search','Explorer header search');
  await viewer.screenshot({path:'artifacts/resource-explorer.png',fullPage:true});
  await viewer.setViewportSize({width:640,height:900});
  await assertIconDoesNotOverlap(viewer,'.viewer-search','Explorer mobile search');
  await viewer.screenshot({path:'artifacts/resource-explorer-mobile.png',fullPage:true});
  await viewer.locator('#dashboard').click();
  await viewer.waitForURL(url => url.pathname==='/test-runner.html',{timeout:20000});
  assert.equal(new URL(viewer.url()).searchParams.has('autorun'),false,
    'Dashboard navigation must open the main screen WITHOUT auto-running.');
  assert.equal(new URL(viewer.url()).searchParams.get('mode'),'seo',
    'Return to the selected audit mode, not the wrong one.');
  assert.equal(await viewer.locator('#site').inputValue(),sites.origin+'/robots.txt',
    'Preserve the audited website when returning home.');
  assert.equal(hits('/robots.txt'),1,
    'Returning to the main dashboard must not launch another scan.');
  console.log('Explorer smoke PASS: icons align; Dashboard returns to the main screen.');

  // Run Tests from the Explorer is also one-click and uses the selected mode.
  await viewer.goto(viewerUrl,{waitUntil:'networkidle'});
  await viewer.locator('#runTests').click();
  await viewer.waitForURL(url=>url.pathname==='/test-runner.html',{timeout:20000});
  await viewer.waitForFunction(()=>
    document.querySelector('#activity')?.textContent?.includes('Finished.'),
    undefined,{timeout:90000},
  );
  assert.equal(hits('/robots.txt'),2,
    'Run Tests from Explorer must launch exactly one SEO scan.');
  console.log('Explorer Run Tests smoke PASS: one click launches the selected SEO suite.');
  assert.deepEqual(exceptions,[],'Extension raised unexpected runtime or browser console errors.');
  console.log('Extension smoke passed: one-click AEO/SEO autorun, one-shot refresh protection, and manual rerun.');
} finally {
  await context?.close();
  await new Promise(resolvePromise=>server.close(resolvePromise));
  if(profile)await rm(profile,{recursive:true,force:true});
}
