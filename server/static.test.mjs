import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const dist = fileURLToPath(new URL('../app/dist/', import.meta.url))

test('production static files expose GeoJSON and GLB with usable content types', { skip: !existsSync(`${dist}/index.html`), timeout: 15000 }, async () => {
  const reservation = createServer()
  reservation.listen(0, '127.0.0.1')
  await once(reservation, 'listening')
  const port = reservation.address().port
  await new Promise((resolve) => reservation.close(resolve))
  const child = spawn(process.execPath, [fileURLToPath(new URL('./index.mjs', import.meta.url))], {
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', GROQ_API_KEY: '', GEMINI_API_KEY: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const exited = once(child, 'exit')
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Static server did not start')), 5000)
      child.once('error', (error) => { clearTimeout(timeout); reject(error) })
      child.stdout.on('data', (data) => {
        if (data.toString().includes('Copilot backend on')) { clearTimeout(timeout); resolve() }
      })
    })
    const base = `http://127.0.0.1:${port}`
    const geo = await fetch(`${base}/data/hazards.geojson`)
    assert.equal(geo.status, 200)
    assert.match(geo.headers.get('content-type'), /application\/geo\+json/)
    assert.equal((await geo.json()).type, 'FeatureCollection')
    const model = readdirSync(`${dist}/assets`).find((name) => /^astronaut-.*\.glb$/.test(name))
    assert.ok(model, 'Build must contain the optimized astronaut')
    const glb = await fetch(`${base}/assets/${model}`)
    assert.equal(glb.status, 200)
    assert.equal(glb.headers.get('content-type'), 'model/gltf-binary')
    assert.ok((await glb.arrayBuffer()).byteLength < 600000, 'Astronaut exceeds its transfer budget')
    const health = await fetch(`${base}/api/copilot/health`)
    assert.equal((await health.json()).provider, null)
  } finally {
    child.kill('SIGTERM')
    await exited
  }
})
