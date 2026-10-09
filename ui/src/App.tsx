import { useState, useEffect, useCallback, useRef } from 'react'
import './App.css'

const API_BASE = '/v1'

interface TemplateSchema {
  id: string;
  name: string;
  version: number;
  fields: Array<{
    id: string;
    type: string;
    maxChars?: number;
    maxLines?: number;
    required?: boolean;
    options?: string[];
    default?: string;
  }>;
}

function App() {
  const [templates, setTemplates] = useState<TemplateSchema[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateSchema | null>(null)
  const [formData, setFormData] = useState<Record<string, string>>({})
  
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isRenderingPreview, setIsRenderingPreview] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  
  // Ref to hold the latest debounce timer
  const debounceTimerRef = useRef<number | null>(null)

  // 1. Fetch available templates on mount
  useEffect(() => {
    fetch(`${API_BASE}/templates`)
      .then(res => res.json())
      .then(data => {
        setTemplates(data)
        if (data.length > 0) {
          handleSelectTemplate(data[0])
        }
      })
      .catch(err => console.error('Failed to load templates:', err))
  }, [])

  const handleSelectTemplate = (tpl: TemplateSchema) => {
    setSelectedTemplate(tpl)
    // Pre-fill initial form data based on required fields and defaults
    const initialData: Record<string, string> = {}
    tpl.fields.forEach(f => {
      if (f.default !== undefined) {
        initialData[f.id] = f.default
      } else if (f.required) {
        initialData[f.id] = f.id.toUpperCase()
      } else {
        initialData[f.id] = ''
      }
    })
    setFormData(initialData)
    // Clear preview to force a new render
    setPreviewUrl(null)
  }

  // 2. Debounced render function for live previews
  const triggerPreview = useCallback((tpl: TemplateSchema, data: Record<string, string>) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    debounceTimerRef.current = setTimeout(async () => {
      setIsRenderingPreview(true)
      try {
        const res = await fetch(`${API_BASE}/render`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            template: tpl.id,
            data,
            scale: 0.5 // High-res preview scale
          })
        })
        
        if (res.ok) {
          const result = await res.json()
          // Append timestamp to bust browser image cache if not cached by backend
          setPreviewUrl(`${result.url}?t=${Date.now()}`)
        } else {
          console.warn('Preview render failed:', await res.text())
        }
      } catch (err) {
        console.error('Preview error:', err)
      } finally {
        setIsRenderingPreview(false)
      }
    }, 400) // 400ms debounce
  }, [])

  // Trigger preview whenever form data or template changes
  useEffect(() => {
    if (selectedTemplate) {
      triggerPreview(selectedTemplate, formData)
    }
  }, [formData, selectedTemplate, triggerPreview])

  const handleInputChange = (fieldId: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [fieldId]: value
    }))
  }

  // 3. High-res export
  const handleExport = async () => {
    if (!selectedTemplate) return
    setIsExporting(true)
    try {
      const res = await fetch(`${API_BASE}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template: selectedTemplate.id,
          data: formData,
          scale: 1 // Full scale
        })
      })
      
      if (res.ok) {
        const result = await res.json()
        
        // Trigger download
        const a = document.createElement('a')
        a.href = result.url
        a.download = `${selectedTemplate.id}-export.png`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      } else {
        alert('Failed to export. Please check character limits.')
      }
    } catch (err) {
      alert('Network error during export.')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="app-container">
      <header className="header">
        <h1>PosterForge Studio</h1>
        <div className="header-status">
          {isRenderingPreview && <span style={{ color: 'var(--accent)' }}>● Syncing Preview...</span>}
        </div>
      </header>

      <div className="main-content">
        
        {/* LEFT COLUMN: Controls & Form */}
        <aside className="sidebar glass-panel">
          
          <div className="template-selector">
            <h2 className="section-title">Select Template</h2>
            <select 
              value={selectedTemplate?.id || ''} 
              onChange={e => {
                const t = templates.find(t => t.id === e.target.value)
                if (t) handleSelectTemplate(t)
              }}
            >
              {templates.map(t => (
                <option key={t.id} value={t.id}>{t.name} (v{t.version})</option>
              ))}
            </select>
          </div>

          {selectedTemplate && (
            <div className="dynamic-form">
              <h2 className="section-title">Content</h2>
              
              {selectedTemplate.fields.map(field => (
                <div key={field.id} className="form-group">
                  <label htmlFor={field.id}>
                    {field.id.replace('_', ' ')} {field.required && '*'}
                  </label>
                  
                  {field.options ? (
                    <select
                      id={field.id}
                      value={formData[field.id] || ''}
                      onChange={e => handleInputChange(field.id, e.target.value)}
                    >
                      <option value="" disabled>Select {field.id}...</option>
                      {field.options.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : field.maxChars && field.maxChars > 60 ? (
                    <textarea
                      id={field.id}
                      value={formData[field.id] || ''}
                      onChange={e => handleInputChange(field.id, e.target.value)}
                      maxLength={field.maxChars}
                      placeholder={`Enter ${field.id}...`}
                    />
                  ) : (
                    <input
                      type="text"
                      id={field.id}
                      value={formData[field.id] || ''}
                      onChange={e => handleInputChange(field.id, e.target.value)}
                      maxLength={field.maxChars}
                      placeholder={`Enter ${field.id}...`}
                    />
                  )}
                  
                  <div className="hint-text">
                    <span>{field.type}</span>
                    {field.maxChars && (
                      <span>{(formData[field.id] || '').length} / {field.maxChars}</span>
                    )}
                  </div>
                </div>
              ))}
              
              <div className="export-section">
                <button 
                  className="btn-primary export-btn"
                  onClick={handleExport}
                  disabled={isExporting}
                >
                  {isExporting ? 'Generating High-Res...' : 'Download High-Res PNG'}
                </button>
              </div>

            </div>
          )}
        </aside>

        {/* RIGHT COLUMN: Live Preview */}
        <main className="preview-container glass-panel">
          {previewUrl ? (
            <div className="preview-wrapper">
              <div className={`preview-loading ${isRenderingPreview ? 'active' : ''}`}>
                Rendering...
              </div>
              <img src={previewUrl} alt="Poster Preview" className="preview-image" />
            </div>
          ) : (
            <div className="empty-state">
              <h3>No Preview Available</h3>
              <p>Select a template to begin</p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

export default App
