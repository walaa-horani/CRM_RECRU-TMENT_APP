async function run() {
  const res = await fetch('https://dominant-elephant-7896.clerk.accounts.dev/npm/@clerk/clerk-js@5/dist/clerk.browser.js');
  const text = await res.text();
  const idx = text.indexOf('4170:');
  console.log('4170 name in i.u:');
  console.log(text.slice(idx - 20, idx + 40));

  // Fetch 4170 chunk
  const chunkRes = await fetch('https://dominant-elephant-7896.clerk.accounts.dev/npm/@clerk/clerk-js@5.127.2/dist/4170_clerk.browser_0cc2cc_5.127.2.js');
  console.log('4170 status:', chunkRes.status);
  const chunkText = await chunkRes.text();
  const descs = Array.from(chunkText.matchAll(/elementDescriptor:\s*g\.descriptors\.([a-zA-Z0-9]+)/g)).map(m => m[1]);
  console.log('Element descriptors used:', Array.from(new Set(descs)));
}

run().catch(console.error);
