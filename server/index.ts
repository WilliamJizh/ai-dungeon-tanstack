import express from 'express'
import cors from 'cors'
import { config } from 'dotenv'
import { storyRouter } from './storyRoute.js'

config()

const app = express()
const PORT = process.env.PORT ?? 3001

app.use(cors({ origin: 'http://localhost:5173' }))
app.use(express.json({ limit: '50kb' }))

app.use('/api/story', storyRouter)

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.listen(PORT, () => {
  console.log(`[server] Listening on http://localhost:${PORT}`)
})
