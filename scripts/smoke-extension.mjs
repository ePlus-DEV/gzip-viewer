import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp, rm, access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {chromium} from 'playwright';

const extension = resolve('.output/chrome-mv3');
const sites = {origin: ''};
const changed = new Date().toISOString();
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
  const page=await context.newPage();
  const exceptions=[];
  page.on('pageerror',error=>exceptions.push(error.stack||error.message));
  page.on('console',message=>{if(message.type()==='error')exceptions.push('console: '+message.text());});
  const url='chrome-extension://'+id+'/test-runner.html?url='+
    encodeURIComponent(sites.origin+'/llms.txt')+'&mode=aeo&scope=quick';
  await page.goto(url,{waitUntil:'networkidle'});
  await page.locator('#run').waitFor({state:'visible'});
  await page.locator('#site').fill(sites.origin+'/llms.txt');
  assert.equal(await page.locator('#run').isEnabled(),true,'Run Tests should start enabled.');
  await page.locator('#run').click();
  await page.waitForFunction(()=>
    document.querySelector('#activity')?.textContent?.includes('Finished.'),
    undefined,{timeout:90000},
  );
  assert.equal(await page.locator('#run').isEnabled(),true,'AEO Run should re-enable on completion.');
  const pass=Number(await page.locator('#passed').innerText());
  assert.ok(pass>=3,'AEO must execute real HTTP/data checks, not just display the UI.');
  assert.match(await page.locator('#elapsed').innerText(),/^\d\d:\d\d:\d\d$/,'Timing must show elapsed duration.');
  console.log('AEO smoke PASS: '+pass+' live checks.');

  await page.locator('input[name="audit-mode"][value="seo"]').check({force:true});
  await page.locator('#scope').selectOption('quick');
  await page.locator('#run').click();
  await page.waitForFunction(()=>
    document.querySelector('#activity')?.textContent?.includes('Finished.'),
    undefined,{timeout:90000},
  );
  assert.equal(await page.locator('#run').isEnabled(),true,'SEO Run should re-enable on completion.');
  const seoPass=Number(await page.locator('#passed').innerText());
  assert.ok(seoPass>=3,'SEO must crawl a real XML sitemap and page.');
  console.log('SEO smoke PASS: '+seoPass+' live checks.');
  assert.deepEqual(exceptions,[],'Extension raised unexpected runtime or browser console errors.');
  console.log('Extension smoke passed: both mode buttons dispatch actual tests.');
} finally {
  await context?.close();
  await new Promise(resolvePromise=>server.close(resolvePromise));
  if(profile)await rm(profile,{recursive:true,force:true});
}
