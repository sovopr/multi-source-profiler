import { useState } from 'react'
import './index.css'

function App() {
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [github, setGithub] = useState('');
  const [configStr, setConfigStr] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      if (csvFile) formData.append('csv', csvFile);
      if (resumeFile) formData.append('resume', resumeFile);
      if (github) formData.append('github', github);
      if (configStr) formData.append('config', configStr);

      const res = await fetch('http://localhost:3001/api/transform', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to transform data');
      
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      <div className="glass-panel input-section">
        <h1 className="title-glow">Candidate Transformer</h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', lineHeight: 1.5 }}>
          Upload inputs to run the ingestion pipeline. The system deterministically resolves conflicts across sources and produces a canonical schema.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Recruiter CSV Upload</label>
            <input type="file" accept=".csv" onChange={(e) => setCsvFile(e.target.files?.[0] || null)} />
          </div>

          <div className="form-group">
            <label>Resume PDF Upload</label>
            <input type="file" accept=".pdf" onChange={(e) => setResumeFile(e.target.files?.[0] || null)} />
          </div>

          <div className="form-group">
            <label>GitHub Username (Optional)</label>
            <input 
              type="text" 
              placeholder="e.g. octocat" 
              value={github}
              onChange={(e) => setGithub(e.target.value)} 
            />
          </div>

          <div className="form-group">
            <label>Custom Output Config (JSON, Optional)</label>
            <textarea 
              placeholder='{ "fields": [ ... ] }' 
              value={configStr}
              onChange={(e) => setConfigStr(e.target.value)}
            />
          </div>

          <button type="submit" className="submit-btn" disabled={loading}>
            {loading ? 'Processing Pipeline...' : 'Run Pipeline'}
          </button>
        </form>

        {error && (
          <div style={{ marginTop: '1rem', color: '#f87171', background: 'rgba(248, 113, 113, 0.1)', padding: '1rem', borderRadius: '8px' }}>
            <strong>Error:</strong> {error}
          </div>
        )}
      </div>

      <div className="glass-panel output-section">
        <div className="output-header">
          <h2>Canonical Profile</h2>
          {result?.overall_confidence !== undefined && (
            <div className="score-badge">
              Confidence Score: {(result.overall_confidence * 100).toFixed(0)}%
            </div>
          )}
        </div>
        
        {result ? (
          <div className="profile-card">
            <pre dangerouslySetInnerHTML={{ __html: syntaxHighlight(JSON.stringify(result, null, 2)) }} />
          </div>
        ) : (
          <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontStyle: 'italic', textAlign: 'center' }}>
            Submit the form to run the pipeline<br/>and generate the canonical profile...
          </div>
        )}
      </div>
    </div>
  );
}

function syntaxHighlight(json: string) {
  json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
    let cls = 'json-number';
    if (/^"/.test(match)) {
      if (/:$/.test(match)) {
        cls = 'json-key';
      } else {
        cls = 'json-string';
      }
    } else if (/true|false/.test(match)) {
      cls = 'json-boolean';
    } else if (/null/.test(match)) {
      cls = 'json-boolean';
    }
    return '<span class="' + cls + '">' + match + '</span>';
  });
}

export default App;
