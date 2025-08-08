import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'

const POLL_TEXT_ENDPOINT = 'https://text.pollinations.ai/openai'
const IMAGE_PROMPT_ENDPOINT = 'https://image.pollinations.ai/prompt/'

const MAX_CONTEXT_MESSAGES = 18

function buildSystemPrompt(): string {
  return [
    'You are ChatterBOX, a concise, helpful AI built for the web app UI. Follow these rules strictly:',
    '- Always format answers in clean, readable Markdown (GFM).',
    '- Use short sections with headings when helpful, followed by bullet lists.',
    '- Prefer examples; for code, use fenced code blocks with the correct language tag.',
    '- Do not include any JSON envelope, metadata, or streaming tokens; output only the final content.',
    '- If the user is vague, ask 1 clarifying question before answering. If clear, answer directly.',
    '- Keep responses focused and avoid redundant prefaces. Offer next-step suggestions when useful.',
    '- If the user requests a specific format (e.g., JSON), follow it exactly; otherwise, Markdown.',
    '- For step-by-step tasks, present ordered steps; for pros/cons, use a 2-column bullet list style.',
    '- Never fabricate URLs or data you are not sure about; say what is unknown succinctly.',
  ].join('\n')
}

function normalizeMarkdown(text: string): string {
  try {
    let t = text
    t = t.replace(/([A-Za-z)])(\d+\.)/g, '$1 $2')
    t = t.replace(/\n{3,}/g, '\n\n')
    return t
  } catch {
    return text
  }
}

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  image?: string | null
}

type Conversation = {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}

export default function App() {
  const initialConversation: Conversation = {
    id: genId(),
    title: 'New chat',
    messages: [{ id: genId(), role: 'assistant', content: 'Welcome to ChatterBOX — Ask me anything!' }],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    try {
      const raw = localStorage.getItem('cbx_conversations')
      if (raw) {
        const parsed = JSON.parse(raw) as Conversation[]
        if (Array.isArray(parsed) && parsed.length > 0) return parsed
      }
    } catch {}
    return [initialConversation]
  })
  const [activeId, setActiveId] = useState<string>(() => {
    const raw = localStorage.getItem('cbx_active_id')
    return raw || conversations[0].id
  })
  const [pendingConv, setPendingConv] = useState<Conversation | null>(null)
  const active: Conversation = (pendingConv && pendingConv.id === activeId)
    ? pendingConv
    : (conversations.find(c => c.id === activeId) || conversations[0])
  const [messages, setMessages] = useState<ChatMessage[]>(active.messages)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [showImageModal, setShowImageModal] = useState(false)
  const [imagePrompt, setImagePrompt] = useState('')
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null)
  const [referrer] = useState<string>(import.meta.env.VITE_REFERRER || '')
  const chatEndRef = useRef<HTMLDivElement | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  function genId() {
    return Math.random().toString(36).slice(2, 9)
  }

  function isActivePending(): boolean {
    return Boolean(
      pendingConv &&
      pendingConv.id === activeId &&
      !conversations.some(c => c.id === pendingConv.id)
    )
  }

  function sanitizeTitle(raw: string) {
    const cleaned = (raw || '').replace(/["'`]/g, '').replace(/\s+/g, ' ').trim()
    const words = cleaned.split(' ').slice(0, 8)
    const joined = words.join(' ')
    return joined.slice(0, 60) || 'New chat'
  }

  async function generateChatTitle(firstMessage: string) {
    const prompt = 'Create a concise 3-6 word chat title for the following user query. Use Title Case, no quotes or punctuation. Return only the title.'
    const payload = {
      model: 'openai',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: firstMessage }
      ],
      stream: false,
      private: false,
    }
    try {
      const url = POLL_TEXT_ENDPOINT + (referrer ? `?referrer=${encodeURIComponent(referrer)}` : '')
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      const title = data?.choices?.[0]?.message?.content || ''
      return sanitizeTitle(String(title))
    } catch {
      return sanitizeTitle(firstMessage)
    }
  }

  async function generateAndApplyTitle(conversationId: string, firstMessage: string) {
    const title = await generateChatTitle(firstMessage)
    setConversations(prev => {
      const updated = prev.map(c => (c.id === conversationId ? { ...c, title } : c))
      localStorage.setItem('cbx_conversations', JSON.stringify(updated))
      return updated
    })
  }

  function scrollToBottom() {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }

  useEffect(() => {
    setMessages(active.messages)
  }, [activeId, pendingConv, conversations])

  // Ensure the active saved conversation mirrors the on-screen message list
  useEffect(() => {
    const savedIdx = conversations.findIndex(c => c.id === activeId)
    if (savedIdx === -1) return
    const saved = conversations[savedIdx]
    const needsUpdate = saved.messages.length !== messages.length ||
      (saved.messages[saved.messages.length - 1]?.content !== messages[messages.length - 1]?.content)
    if (!needsUpdate) return
    const updatedConv = { ...saved, messages: messages, updatedAt: Date.now() }
    const updated = [...conversations]
    updated[savedIdx] = updatedConv
    setConversations(updated)
    localStorage.setItem('cbx_conversations', JSON.stringify(updated))
  }, [messages])

  function persist(updated: Conversation[], newActiveId?: string) {
    setConversations(updated)
    localStorage.setItem('cbx_conversations', JSON.stringify(updated))
    if (newActiveId) {
      setActiveId(newActiveId)
      localStorage.setItem('cbx_active_id', newActiveId)
    }
  }

  function updateActiveConversation(updater: (c: Conversation) => Conversation) {
    const updated = conversations.map(c => (c.id === active.id ? updater(c) : c))
    persist(updated)
  }

  function createNewConversation() {
    const conv: Conversation = {
      id: genId(),
      title: 'New chat',
      messages: [{ id: genId(), role: 'assistant', content: 'New chat started. Ask away!' }],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    setPendingConv(conv)
    setActiveId(conv.id)
    localStorage.setItem('cbx_active_id', conv.id)
    setMessages(conv.messages)
  }

  function selectConversation(id: string) {
    if (id === activeId) return
    setActiveId(id)
    localStorage.setItem('cbx_active_id', id)
  }

  function renameConversation(id: string) {
    const name = prompt('Rename chat')
    if (!name) return
    if (pendingConv && pendingConv.id === id) {
      setPendingConv({ ...pendingConv, title: name, updatedAt: Date.now() })
    } else {
      const updated = conversations.map(c => (c.id === id ? { ...c, title: name, updatedAt: Date.now() } : c))
      persist(updated)
    }
  }

  function deleteConversation(id: string) {
    if (pendingConv && pendingConv.id === id) {
      setPendingConv(null)
      const fallback = conversations[0]?.id
      if (fallback) {
        setActiveId(fallback)
        localStorage.setItem('cbx_active_id', fallback)
      }
      return
    }
    let updated = conversations.filter(c => c.id !== id)
    if (updated.length === 0) {
      const conv: Conversation = {
        id: genId(), title: 'New chat', messages: [{ id: genId(), role: 'assistant', content: 'Welcome!' }], createdAt: Date.now(), updatedAt: Date.now()
      }
      // do not persist empty until first user message; keep as pending
      setPendingConv(conv)
      setActiveId(conv.id)
      localStorage.setItem('cbx_active_id', conv.id)
      persist([])
      return
    }
    const newActive = updated[0].id
    persist(updated, id === activeId ? newActive : activeId)
  }

  async function sendMessage(text: string) {
    if (!text.trim()) return
    const userMsg: ChatMessage = { id: genId(), role: 'user', content: text }
    updateActiveConversation(c => ({ ...c, messages: [...c.messages, userMsg], updatedAt: Date.now(), title: c.title === 'New chat' ? text.slice(0, 40) : c.title }))
    setMessages(prev => [...prev, userMsg])
    setInput('')
    // Promote pending conversation to persisted storage on first user message
    if (isActivePending() && pendingConv) {
      const base = pendingConv as Conversation
      const provisionalTitle = sanitizeTitle(text)
      const promoted: Conversation = { ...base, messages: [...base.messages, userMsg], title: provisionalTitle || base.title, updatedAt: Date.now() }
      const updated = [promoted, ...conversations]
      setPendingConv(null)
      persist(updated, promoted.id)
      void generateAndApplyTitle(promoted.id, text)
    }
    const history = (isActivePending() && pendingConv)
      ? [ ...(pendingConv.messages || []), userMsg ]
      : [ ...(conversations.find(c => c.id === active.id)?.messages || messages.filter(() => true)), userMsg ]
    await callPollinationsChat(history)
  }

  async function callPollinationsChat(messageHistory: ChatMessage[]) {
    setLoading(true)
    setStreaming(true)

    const recent = messageHistory.slice(-MAX_CONTEXT_MESSAGES)
    const payloadMessages = [
      { role: 'system', content: buildSystemPrompt() },
      ...recent.map(m => ({ role: m.role, content: m.content })),
    ]

    const payload = {
      model: 'openai',
      messages: payloadMessages,
      stream: true,
      private: false,
      temperature: 0.7,
    }

    const ac = new AbortController()
    abortControllerRef.current = ac

    try {
      const url = POLL_TEXT_ENDPOINT + (referrer ? `?referrer=${encodeURIComponent(referrer)}` : '')
      // Timeout after 45s
      const timeoutId = setTimeout(() => {
        try { ac.abort() } catch {}
      }, 45000)
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
        body: JSON.stringify(payload),
        signal: ac.signal
      })
      clearTimeout(timeoutId)

      if (!res.ok) {
        const text = await res.text()
        throw new Error('API error: ' + text)
      }

      const reader = res.body?.getReader()
      if (!reader) {
        // Fallback: non-streaming response
        const data = await res.json()
        const text = data?.choices?.[0]?.message?.content || JSON.stringify(data)
        const finalMsg: ChatMessage = { id: genId(), role: 'assistant', content: text }
        setMessages(prev => [...prev, finalMsg])
        if (pendingConv && pendingConv.id === active.id) {
          setPendingConv(prev => prev ? { ...prev, messages: [...prev.messages, finalMsg], updatedAt: Date.now() } : prev)
        } else {
          updateActiveConversation(c => ({ ...c, messages: [...c.messages, finalMsg], updatedAt: Date.now() }))
        }
        return
      }
      const decoder = new TextDecoder()
      let done = false
      let assistantMsg: ChatMessage = { id: genId(), role: 'assistant', content: '' }
      setMessages(prev => [...prev, assistantMsg])
      if (pendingConv && pendingConv.id === active.id) {
        setPendingConv({ ...pendingConv, messages: [...pendingConv.messages, assistantMsg], updatedAt: Date.now() })
      } else {
        updateActiveConversation(c => ({ ...c, messages: [...c.messages, assistantMsg], updatedAt: Date.now() }))
      }

      while (!done) {
        const { value, done: doneReading } = await reader.read()
        done = doneReading
        if (value) {
          const chunk = decoder.decode(value, { stream: true })
          assistantMsg = { ...assistantMsg, content: assistantMsg.content + parseChunkToText(chunk) }
          setMessages(prev => {
            const copy = [...prev]
            const idx = copy.findIndex(m => m.id === assistantMsg.id)
            if (idx !== -1) copy[idx] = { ...assistantMsg }
            return copy
          })
          if (pendingConv && pendingConv.id === active.id) {
            setPendingConv(prev => {
              if (!prev) return prev
              const copy = [...prev.messages]
              const idx = copy.findIndex(m => m.id === assistantMsg.id)
              if (idx !== -1) copy[idx] = { ...assistantMsg }
              return { ...prev, messages: copy, updatedAt: Date.now() }
            })
          } else {
            updateActiveConversation(c => {
              const copy = [...c.messages]
              const idx = copy.findIndex(m => m.id === assistantMsg.id)
              if (idx !== -1) copy[idx] = { ...assistantMsg }
              return { ...c, messages: copy, updatedAt: Date.now() }
            })
          }
        }
      }

    } catch (err: any) {
      console.error('Chat error', err)
      setError(err?.message || 'Unknown error')
      const errMsg: ChatMessage = { id: genId(), role: 'assistant', content: '⚠️ Error: ' + err.message }
      setMessages(prev => [...prev, errMsg])
      if (pendingConv && pendingConv.id === active.id) {
        setPendingConv(prev => prev ? { ...prev, messages: [...prev.messages, errMsg], updatedAt: Date.now() } : prev)
      } else {
        updateActiveConversation(c => ({ ...c, messages: [...c.messages, errMsg], updatedAt: Date.now() }))
      }
    } finally {
      setLoading(false)
      setStreaming(false)
      abortControllerRef.current = null
    }
  }

  function parseChunkToText(chunk: string) {
    try {
      const lines = chunk
        .split(/\n+/)
        .map(s => s.trim())
        .filter(Boolean)
        .map(s => s.replace(/^data:\s*/i, ''))
        .filter(s => s !== '[DONE]')

      let out = ''
      for (const line of lines) {
        try {
          const obj = JSON.parse(line)
          const token = obj?.choices?.[0]?.delta?.content ?? obj?.choices?.[0]?.message?.content
          if (typeof token === 'string') out += token
        } catch {
          // ignore non-JSON fragments
        }
      }
      return out
    } catch (e) {
      return chunk
    }
  }

  // normalizeMarkdown moved to module scope so ChatBubble can use it

  function cancelStream() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      setStreaming(false)
      setLoading(false)
      abortControllerRef.current = null
    }
  }

  async function generateImage(prompt: string) {
    if (!prompt.trim()) return
    setShowImageModal(false)
    setGeneratedImageUrl(null)
    setImagePrompt(prompt)
    try {
      const encoded = encodeURIComponent(prompt)
      const url = `${IMAGE_PROMPT_ENDPOINT}${encoded}${referrer ? `?referrer=${encodeURIComponent(referrer)}` : ''}`
      const imageUrl = url
      setGeneratedImageUrl(imageUrl)
      const genMsg: ChatMessage = { id: genId(), role: 'assistant', content: `Generated image for: "${prompt}"`, image: imageUrl }
      setMessages(prev => [...prev, genMsg])
      if (pendingConv && pendingConv.id === active.id) {
        setPendingConv(prev => prev ? { ...prev, messages: [...prev.messages, genMsg], updatedAt: Date.now() } : prev)
      } else {
        updateActiveConversation(c => ({ ...c, messages: [...c.messages, genMsg], updatedAt: Date.now() }))
      }
    } catch (err: any) {
      setMessages(prev => [...prev, { id: genId(), role: 'assistant', content: 'Image generation failed: ' + err.message }])
    }
  }

  // Audio features removed per requirements

  async function analyzeImageFile(file?: File | null) {
    if (!file) return
    const base64 = await fileToBase64(file)
    const userMsg: ChatMessage = { id: genId(), role: 'user', content: 'Analyze this image', image: file.name }
    setMessages(prev => [...prev, userMsg])

    const payload = {
      model: 'openai',
      messages: [
        { role: 'user', content: 'Describe this image:' },
        { role: 'user', content: [ { type: 'image_url', image_url: { url: `data:${file.type};base64,${String(base64).split(',')[1]}` } } ] as any }
      ]
    }

    try {
      const url = POLL_TEXT_ENDPOINT + (referrer ? `?referrer=${encodeURIComponent(referrer)}` : '')
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      const text = data?.choices?.[0]?.message?.content || JSON.stringify(data)
      setMessages(prev => [...prev, { id: genId(), role: 'assistant', content: text }])
    } catch (err: any) {
      setError(err?.message || 'Image analysis error')
      setMessages(prev => [...prev, { id: genId(), role: 'assistant', content: 'Image analysis failed: ' + err.message }])
    }
  }

  // Speech recognition removed per requirements

  function fileToBase64(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  return (
    <div className="min-h-screen text-white" style={{ backgroundImage: 'radial-gradient(1250px circle at 10% 10%, rgba(59,130,246,0.08), transparent 40%), radial-gradient(1250px circle at 90% 10%, rgba(236,72,153,0.08), transparent 40%), radial-gradient(1250px circle at 50% 100%, rgba(16,185,129,0.06), transparent 40%)' }}>
      <div className="max-w-6xl mx-auto py-4 md:py-8 px-3 md:px-6">
        <div className="mb-4 flex items-center justify-between md:hidden">
          <div className="flex items-center gap-2">
            <img src={import.meta.env.VITE_LOGO || '/chatterbox_logo.png'} alt="ChatterBOX" className="w-8 h-8 rounded" />
            <span className="font-semibold">ChatterBOX</span>
          </div>
          <button className="px-3 py-2 rounded bg-white/10" onClick={() => setSidebarOpen(s => !s)}>{sidebarOpen ? 'Close' : 'Menu'}</button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-6 items-start">
          <aside className={`md:col-span-1 bg-gradient-to-br from-[#0f1724] to-[#071023] rounded-2xl p-6 shadow-xl border border-white/10 ${sidebarOpen ? 'block' : 'hidden'} md:block h-[78vh] md:h-[84vh] overflow-y-auto no-scrollbar`}>
            <div className="flex items-center gap-3">
              <img src={import.meta.env.VITE_LOGO || '/chatterbox_logo.png'} alt="ChatterBOX" className="w-14 h-14 rounded-lg" />
              <div>
                <h1 className="text-2xl font-bold tracking-tight">ChatterBOX</h1>
                <p className="text-sm text-gray-400">AI chat, images, voice & vision.</p>
              </div>
            </div>

            <nav className="mt-6 space-y-3">
              <button onClick={createNewConversation} className="w-full text-left py-2 px-3 rounded-lg bg-white/10 hover:bg-white/15 transition">+ New chat</button>
              <div className="space-y-1 max-h-[45vh] overflow-y-auto pr-1">
                {conversations.map(c => (
                  <div key={c.id} className={`group flex items-center justify-between gap-2 px-2 py-2 rounded cursor-pointer ${c.id === activeId ? 'bg-white/10' : 'hover:bg-white/5'}`} onClick={() => selectConversation(c.id)}>
                    <div className="truncate text-sm" title={c.title}>{c.title}</div>
                    <div className="opacity-0 group-hover:opacity-100 transition flex items-center gap-1">
                      <button className="text-xs underline" onClick={(e) => { e.stopPropagation(); renameConversation(c.id) }}>Rename</button>
                      <button className="text-xs underline" onClick={(e) => { e.stopPropagation(); deleteConversation(c.id) }}>Delete</button>
                    </div>
                  </div>
                ))}
                {pendingConv && (
                  <div className={`group flex items-center justify-between gap-2 px-2 py-2 rounded cursor-pointer ${pendingConv.id === activeId ? 'bg-white/10' : 'hover:bg-white/5'}`} onClick={() => selectConversation(pendingConv.id)}>
                    <div className="truncate text-sm" title={pendingConv.title}>{pendingConv.title}</div>
                    <div className="opacity-0 group-hover:opacity-100 transition flex items-center gap-1">
                      <button className="text-xs underline" onClick={(e) => { e.stopPropagation(); renameConversation(pendingConv.id) }}>Rename</button>
                      <button className="text-xs underline" onClick={(e) => { e.stopPropagation(); deleteConversation(pendingConv.id) }}>Delete</button>
                    </div>
                  </div>
                )}
              </div>
              <button onClick={() => setShowImageModal(true)} className="w-full text-left py-2 px-3 rounded-lg hover:bg-white/10 transition">Generate Image</button>
              <label className="w-full block">
                <input type="file" accept="image/*" className="hidden" onChange={e => analyzeImageFile(e.target.files?.[0])} />
                <div className="py-2 px-3 rounded-lg hover:bg-white/10 transition cursor-pointer">Analyze Image</div>
              </label>
              <div className="mt-4 text-xs text-gray-400">Conversations are stored in your browser.</div>

              <div className="mt-6 text-xs text-gray-400 space-y-2">
                <p>Tips: Use the image generator for creative visuals.</p>
                <p>Built by <a className="underline" href="https://github.com/prateek54353" target="_blank" rel="noreferrer">prateek54353</a>.</p>
              </div>
            </nav>
          </aside>

          <main className="md:col-span-3 bg-gradient-to-b from-[#071025] to-[#04121a] rounded-2xl p-4 md:p-6 shadow-2xl border border-white/10 flex flex-col h-[78vh] md:h-[84vh] min-h-0" role="main">
            <div className="flex items-center justify-between mb-4">
      <div>
                <h2 className="text-lg font-semibold">Talk to ChatterBOX</h2>
                <p className="text-sm text-gray-400">Fast, smooth streaming responses — powered by Pollinations.AI.</p>
              </div>
              <div className="flex items-center gap-3">
                {streaming ? (
                  <button onClick={cancelStream} className="px-3 py-2 rounded bg-red-600 hover:bg-red-500 transition">Stop</button>
                ) : (
                  <div className="text-xs text-gray-400">{loading ? 'Waiting...' : 'Ready'}</div>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar p-2 md:p-4 rounded-lg mb-4 bg-gradient-to-b from-white/5 to-transparent min-h-0 max-h-full">
              {messages.map(msg => (
                <ChatBubble key={msg.id} message={msg} />
              ))}
              <div ref={chatEndRef} />
            </div>

            <div className="mt-auto pt-3">
              <div className="flex items-center gap-3">
                <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') sendMessage(input) }} placeholder="Type a message or press Enter..." className="flex-1 bg-transparent border border-white/20 rounded-lg py-3 px-4 placeholder:text-gray-500" />
                <input id="fileUpload" type="file" accept="image/*" className="hidden" onChange={e => analyzeImageFile(e.target.files?.[0])} />
                <label htmlFor="fileUpload" className="p-3 rounded-lg bg-white/10 cursor-pointer">📁</label>
                <button onClick={() => sendMessage(input)} disabled={loading} className="px-4 py-2 rounded-lg bg-gradient-to-r from-pink-500 to-purple-600 shadow-md hover:from-pink-400">Send</button>
              </div>
            </div>

          </main>
        </div>

        {showImageModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="bg-[#06121b] rounded-2xl p-6 w-full max-w-2xl">
              <h3 className="text-lg font-semibold mb-3">Generate Image</h3>
              <p className="text-sm text-gray-400 mb-4">Describe the image you want (style, mood, colors). We'll use Pollinations' image endpoint.</p>
              <input value={imagePrompt} onChange={e => setImagePrompt(e.target.value)} placeholder="A neon cyberpunk city at dusk, cinematic, 8k" className="w-full bg-transparent border border-white/10 rounded p-3 mb-4" />
              <div className="flex items-center gap-3 justify-end">
                <button onClick={() => setShowImageModal(false)} className="px-4 py-2 rounded bg-white/5">Cancel</button>
                <button onClick={() => generateImage(imagePrompt)} className="px-4 py-2 rounded bg-gradient-to-r from-pink-500 to-purple-600">Generate</button>
              </div>
            </div>
          </div>
        )}

        {generatedImageUrl && (
          <div className="mt-6 bg-[#04121a] rounded-2xl p-4 border border-white/5 shadow-lg">
            <h4 className="mb-3 font-semibold">Generated Image</h4>
            <div className="rounded overflow-hidden border border-white/5">
              <img alt="Generated" src={generatedImageUrl} className="w-full object-cover max-h-96" />
            </div>
          </div>
        )}

        {error && (
          <div className="fixed bottom-6 right-6 z-50">
            <div className="bg-red-600 text-white rounded-lg shadow-lg px-4 py-3 flex items-start gap-3">
              <div className="font-semibold">Error</div>
              <div className="text-sm opacity-90">{error}</div>
              <button className="ml-2 text-sm underline" onClick={() => setError(null)}>dismiss</button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  async function onCopy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {}
  }
  return (
    <button onClick={onCopy} className="text-xs bg-white/10 hover:bg-white/15 px-2 py-1 rounded">
      {copied ? 'Copied' : label}
        </button>
  )
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  const content = normalizeMarkdown(message.content)
  const mdComponents = {
    code({inline, className, children, ...props}: any) {
      const codeText = String(children || '')
      if (inline) return <code className={className} {...props}>{children}</code>
      return (
        <div className="relative">
          <pre className={className} {...props}><code>{codeText}</code></pre>
          <div className="absolute top-2 right-2"><CopyButton text={codeText} label="Copy code" /></div>
        </div>
      )
    }
  }
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className={`max-w-[78%] p-3 rounded-xl ${isUser ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white' : 'bg-white/4 text-gray-200'} shadow-sm animate-fade-in`}>        
        <div className="flex items-start gap-3">
          <div className="flex-1 prose prose-invert max-w-none prose-pre:overflow-x-auto prose-pre:bg-black/30 prose-pre:p-3 prose-pre:rounded min-w-0">
            {isUser ? (
              <div className="whitespace-pre-wrap break-words">{content}</div>
            ) : (
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={mdComponents}>{content}</ReactMarkdown>
            )}
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            {message.image && <a href={message.image} target="_blank" rel="noreferrer" className="text-xs underline">Open</a>}
            <CopyButton text={content} />
          </div>
        </div>
      </div>
    </div>
  )
}
