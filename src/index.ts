import { Hono } from 'hono'

type Env = { BUCKET: R2Bucket }
const app = new Hono<{ Bindings: Env }>()

// 1. Hide Root Folder
app.get('/', (c) => c.text('Not Found', 404))

// 2. Browse & Serve Files Publicly
app.get('/*', async (c) => {
    const path = c.req.path.substring(1) // remove leading /
    const prefix = path.endsWith('/') ? path : `${path}/`

    // Check directory listing first
    const listing = await c.env.BUCKET.list({ prefix, delimiter: '/' })

    // Filter out empty directory marker objects (e.g. "test/" inside prefix "test/")
    const realObjects = listing.objects.filter(
        (o) => o.key !== prefix && !o.key.endsWith('/')
    )
    const subFolders = listing.delimitedPrefixes

    // If items exist, render directory HTML
    if (realObjects.length > 0 || subFolders.length > 0) {
        const items = [
            ...subFolders.map((p) => {
                const folderName = p.replace(prefix, '')
                return `📁 <a href="/${p}">${folderName}</a>`
            }),
        ...realObjects.map((o) => {
            const fileName = o.key.replace(prefix, '')
            return `📄 <a href="/${o.key}">${fileName}</a>`
        }),
        ]

        const pathSegments = prefix.split('/').filter(Boolean)
        const showUpLink = pathSegments.length > 1
        const parentPath = pathSegments.slice(0, -1).join('/')

        return c.html(`
        <!DOCTYPE html>
        <html>
        <body>
        <h2>Index of /${prefix}</h2>
        ${showUpLink ? `<p><a href="/${parentPath}/">.. (Up one level)</a></p>` : ''}
        <ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>
        </body>
        </html>
        `)
    }

    // If not a directory, serve actual file
    const object = await c.env.BUCKET.get(path)
    if (object) {
        const headers = new Headers()
        object.writeHttpMetadata(headers)
        headers.set('etag', object.httpEtag)
        return new Response(object.body, { headers })
    }

    return c.text('Not Found', 404)
})

export default app
