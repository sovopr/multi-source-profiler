import { useMemo, useState } from 'react'
import './index.css'

type Skill = { name: string; confidence?: number; sources?: string[] }
type Experience = { company?: string; title?: string; start?: string | null; end?: string | null; summary?: string }
type Education = { institution?: string; degree?: string; field?: string; end_year?: number | null }
type Profile = {
  candidate_id?: string
  full_name?: string
  emails?: string[]
  phones?: string[]
  headline?: string | null
  skills?: Skill[]
  experience?: Experience[]
  projects?: { name?: string; description?: string; link?: string }[]
  education?: Education[]
  provenance?: unknown[]
  overall_confidence?: number
}
type ApiResult = { canonical?: Profile | Profile[]; projected?: unknown; errors?: string[] }

const emptyResult: ApiResult | null = null

function App() {
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [github, setGithub] = useState('')
  const [configStr, setConfigStr] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ApiResult | null>(emptyResult)
  const [error, setError] = useState<string | null>(null)
  const [selectedProfile, setSelectedProfile] = useState(0)
  const [view, setView] = useState<'profile' | 'json'>('profile')

  const profiles = useMemo(() => {
    if (!result?.canonical) return []
    return Array.isArray(result.canonical) ? result.canonical : [result.canonical]
  }, [result])

  const profile = profiles[selectedProfile] || profiles[0]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setResult(null)
    setSelectedProfile(0)
    setView('profile')

    try {
      const formData = new FormData()
      if (csvFile) formData.append('csv', csvFile)
      if (resumeFile) formData.append('resume', resumeFile)
      if (github) formData.append('github', github)
      if (configStr) formData.append('config', configStr)

      const res = await fetch('http://localhost:3001/api/transform', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to transform data')
      setResult(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app-container">
      <section className="panel input-section">
        <h1>Candidate Transformer</h1>
        <p className="intro">Upload candidate inputs and generate schema-valid canonical profiles.</p>

        <form onSubmit={handleSubmit}>
          <DragDropFile label="Recruiter CSV" accept=".csv" file={csvFile} setFile={setCsvFile} />
          <DragDropFile label="Resume PDF" accept=".pdf" file={resumeFile} setFile={setResumeFile} />

          <div className="form-group">
            <label>GitHub Username</label>
            <input
              type="text"
              placeholder="octocat"
              value={github}
              onChange={(e) => setGithub(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>Output Config JSON</label>
            <textarea
              placeholder='{ "fields": [ ... ] }'
              value={configStr}
              onChange={(e) => setConfigStr(e.target.value)}
            />
          </div>

          <button type="submit" className="submit-btn" disabled={loading}>
            {loading ? 'Processing...' : 'Run Pipeline'}
          </button>
        </form>

        {error && <div className="error-box">{error}</div>}
      </section>

      <section className="panel output-section">
        <div className="output-header">
          <div>
            <h2>{profile?.full_name || 'Canonical Profile'}</h2>
            {profile?.candidate_id && <p>{profile.candidate_id}</p>}
          </div>
          {typeof profile?.overall_confidence === 'number' && (
            <div className="score-badge">{Math.round(profile.overall_confidence * 100)}%</div>
          )}
        </div>

        {profiles.length > 1 && (
          <div className="candidate-tabs">
            {profiles.map((item, index) => (
              <button
                key={item.candidate_id || index}
                className={index === selectedProfile ? 'active' : ''}
                type="button"
                onClick={() => setSelectedProfile(index)}
              >
                {item.full_name || `Candidate ${index + 1}`}
              </button>
            ))}
          </div>
        )}

        {result && (
          <div className="view-tabs">
            <button className={view === 'profile' ? 'active' : ''} type="button" onClick={() => setView('profile')}>
              Profile
            </button>
            <button className={view === 'json' ? 'active' : ''} type="button" onClick={() => setView('json')}>
              JSON
            </button>
          </div>
        )}

        {result?.errors && result.errors.length > 0 && (
          <div className="warning-box">
            {result.errors.map((item) => (
              <div key={item}>{item}</div>
            ))}
          </div>
        )}

        {!result ? (
          <div className="empty-state">Run the pipeline to view the canonical profile.</div>
        ) : view === 'json' ? (
          <pre>{JSON.stringify(result.projected ?? result.canonical ?? result, null, 2)}</pre>
        ) : profile ? (
          <ProfileView profile={profile} projected={result.projected} selectedProfile={selectedProfile} />
        ) : (
          <div className="empty-state">No valid profile returned.</div>
        )}
      </section>
    </div>
  )
}

function ProfileView({ profile, projected, selectedProfile }: { profile: Profile; projected?: unknown; selectedProfile: number }) {
  const projectedItem = Array.isArray(projected) ? projected[selectedProfile] : projected

  return (
    <div className="profile-view">
      <div className="summary-grid">
        <SummaryItem label="Emails" value={profile.emails?.join(', ') || 'null'} />
        <SummaryItem label="Phones" value={profile.phones?.join(', ') || 'null'} />
        <SummaryItem label="Skills" value={String(profile.skills?.length || 0)} />
        <SummaryItem label="Provenance" value={String(profile.provenance?.length || 0)} />
      </div>

      {profile.headline && <p className="headline">{profile.headline}</p>}

      <section className="output-group">
        <h3>Skills</h3>
        {profile.skills?.length ? (
          <div className="skill-list">
            {profile.skills.map((skill) => (
              <span className="skill-chip" key={skill.name}>
                {skill.name}
                {typeof skill.confidence === 'number' && <small>{Math.round(skill.confidence * 100)}%</small>}
              </span>
            ))}
          </div>
        ) : (
          <p className="muted">null</p>
        )}
      </section>

      <section className="output-group">
        <h3>Experience</h3>
        {profile.experience?.length ? (
          <div className="timeline">
            {profile.experience.map((item, index) => (
              <article key={`${item.company}-${item.title}-${index}`}>
                <strong>{item.title || 'Unknown title'}</strong>
                <span>{item.company || 'Unknown company'}</span>
                <small>{[item.start, item.end || 'Present'].filter(Boolean).join(' - ') || 'Dates unavailable'}</small>
                {item.summary && <p>{item.summary}</p>}
              </article>
            ))}
          </div>
        ) : (
          <p className="muted">null</p>
        )}
      </section>

      <section className="output-group">
        <h3>Projects</h3>
        {profile.projects?.length ? (
          <div className="timeline">
            {profile.projects.map((item, index) => (
              <article key={`${item.name}-${index}`}>
                <strong>
                  {item.link ? (
                    <a href={item.link} target="_blank" rel="noopener noreferrer">{item.name || 'Unknown project'}</a>
                  ) : (
                    item.name || 'Unknown project'
                  )}
                </strong>
                {item.description && <p>{item.description}</p>}
              </article>
            ))}
          </div>
        ) : (
          <p className="muted">null</p>
        )}
      </section>

      <section className="output-group">
        <h3>Education</h3>
        {profile.education?.length ? (
          <div className="timeline">
            {profile.education.map((item, index) => (
              <article key={`${item.institution}-${index}`}>
                <strong>{item.institution || 'Unknown institution'}</strong>
                <span>{[item.degree, item.field].filter(Boolean).join(' · ') || 'Degree unavailable'}</span>
                {item.end_year && <small>{item.end_year}</small>}
              </article>
            ))}
          </div>
        ) : (
          <p className="muted">null</p>
        )}
      </section>
    </div>
  )
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="summary-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function DragDropFile({ label, accept, file, setFile }: { label: string, accept: string, file: File | null, setFile: (f: File | null) => void }) {
  const [dragging, setDragging] = useState(false)

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragging(true)
    } else if (e.type === "dragleave") {
      setDragging(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0])
    }
  }

  return (
    <div className="form-group">
      <label>{label}</label>
      <div 
        className={`file-drop-zone ${dragging ? 'dragging' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => document.getElementById(`file-${label}`)?.click()}
      >
        <input 
          id={`file-${label}`}
          type="file" 
          accept={accept} 
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          style={{ display: 'none' }}
        />
        <div className="drop-content">
          {file ? <span className="file-name">{file.name}</span> : <span>Drag & Drop {label} or Click to Browse</span>}
        </div>
      </div>
    </div>
  )
}
export default App
