/**
 * Root web component. Dashboard-style overview of the API platform:
 * auth status, plan, API key, usage chart, business test panels.
 */
import { useState } from 'react';
import { api, AuthApi } from './apiClient.js';
import { useAuth } from './useAuth.js';

export default function App() {
  const { user, setAuth, clearAuth } = useAuth();
  const [tab, setTab] = useState('dashboard');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="font-semibold text-lg">API-Website</div>
          <div className="flex items-center gap-4 text-sm">
            {user ? (
              <>
                <span className="text-slate-400">{user.email}</span>
                <button
                  onClick={() => clearAuth()}
                  className="rounded border border-slate-700 px-3 py-1 hover:bg-slate-800"
                >
                  退出
                </button>
              </>
            ) : (
              <button
                onClick={() => setTab('login')}
                className="rounded bg-indigo-600 px-3 py-1 hover:bg-indigo-500"
              >
                登录 / 注册
              </button>
            )}
          </div>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-2 px-6 pb-3 text-sm">
          {['dashboard', 'keys', 'usage', 'test'].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded px-3 py-1 ${
                tab === t ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
              } ${user ? '' : 'hidden'}`}
            >
              {t === 'dashboard' ? '概览' : t === 'keys' ? 'API Keys' : t === 'usage' ? '用量' : '接口测试'}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-6">
        {tab === 'dashboard' && <Dashboard user={user} />}
        {tab === 'login' && (
          <AuthForm
            onDone={(u) => {
              setAuth(u);
              setTab('dashboard');
            }}
          />
        )}
        {tab === 'keys' && user && <KeysPanel />}
        {tab === 'usage' && user && <UsagePanel />}
        {tab === 'test' && user && <TestPanel apiKey={localStorage.getItem('apiKey') ?? ''} />}
      </main>
    </div>
  );
}

function Dashboard({ user }) {
  if (!user) {
    return <div className="text-slate-400">请先登录。</div>;
  }
  return (
    <div className="grid gap-4">
      <section className="rounded border border-slate-800 p-4">
        <h2 className="text-lg">账号</h2>
        <p className="text-slate-400">邮箱：{user.email}</p>
        <p className="text-slate-400">套餐：{user.plan}</p>
        <p className="text-slate-400">角色：{user.role}</p>
      </section>
      <section className="rounded border border-slate-800 p-4">
        <h2 className="text-lg">快速链接</h2>
        <p className="text-slate-400">在 “API Keys” 创建密钥后，可在 “接口测试” 中调用 echo / weather / translate。</p>
      </section>
    </div>
  );
}

function AuthForm({ onDone }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      const path = mode === 'login' ? '/auth/login' : '/auth/register';
      const res = await api.post(path, { email, password });
      localStorage.setItem('accessToken', res.data.tokens.accessToken);
      localStorage.setItem('refreshToken', res.data.tokens.refreshToken);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      onDone(res.data.user);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-md space-y-4">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode('login')}
          className={`rounded px-3 py-1 ${mode === 'login' ? 'bg-slate-800' : 'text-slate-400'}`}
        >
          登录
        </button>
        <button
          type="button"
          onClick={() => setMode('register')}
          className={`rounded px-3 py-1 ${mode === 'register' ? 'bg-slate-800' : 'text-slate-400'}`}
        >
          注册
        </button>
      </div>
      <input
        type="email"
        placeholder="邮箱"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2"
      />
      <input
        type="password"
        placeholder="密码（至少 8 位）"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2"
      />
      {error && <p className="text-red-400">{error}</p>}
      <button className="w-full rounded bg-indigo-600 py-2 hover:bg-indigo-500">提交</button>
    </form>
  );
}

function KeysPanel() {
  const [keys, setKeys] = useState([]);
  const [error, setError] = useState('');

  async function refresh() {
    try {
      const res = await api.get('/keys');
      setKeys(res.data);
    } catch (err) {
      setError(err.message);
    }
  }

  async function createKey() {
    try {
      const res = await api.post('/keys', { name: 'new-key' });
      const key = window.prompt('保存你的密钥（之后不再显示）：', res.data.key);
      if (key === 'save') localStorage.setItem('apiKey', res.data.key);
      refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function revoke(id) {
    await api.delete(`/keys/${id}`);
    refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg">API Keys</h2>
        <button onClick={createKey} className="rounded bg-indigo-600 px-3 py-1 text-sm">
          创建
        </button>
      </div>
      {error && <p className="text-red-400">{error}</p>}
      <ul className="space-y-2">
        {keys.map((k) => (
          <li key={k.id} className="flex items-center justify-between rounded border border-slate-800 p-3">
            <div>
              <div className="font-mono text-sm">{k.prefix}</div>
              <div className="text-xs text-slate-500">创建于 {new Date(k.createdAt).toLocaleString()}</div>
            </div>
            <button onClick={() => revoke(k.id)} className="text-red-400 text-sm">
              吊销
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function UsagePanel() {
  const [data, setData] = useState(null);

  async function load() {
    try {
      const res = await api.get('/usage?range=week');
      setData(res.data);
    } catch {}
  }

  return (
    <div className="space-y-4">
      <button onClick={load} className="rounded bg-slate-800 px-3 py-1">
        刷新（近 7 天）
      </button>
      {data && (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700">
              <th>日期</th>
              <th>请求数</th>
              <th>错误率</th>
              <th>平均延迟(ms)</th>
            </tr>
          </thead>
          <tbody>
            {data.buckets.map((b) => (
              <tr key={b.period}>
                <td>{b.period}</td>
                <td>{b.requests}</td>
                <td>{b.errorRate}</td>
                <td>{b.avgLatencyMs}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function TestPanel({ apiKey }) {
  const [result, setResult] = useState('');

  async function call(path, method = 'GET', body) {
    try {
      const res = await api.callBusiness(path, method, body, apiKey);
      setResult(JSON.stringify(res.data, null, 2));
    } catch (err) {
      setResult(`错误：${err.message}`);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-slate-400 text-sm">密钥：{apiKey || '（未设置）'}</p>
      <button onClick={() => call('/echo?message=hello')} className="rounded bg-slate-800 px-3 py-1">
        测试 Echo
      </button>
      <button onClick={() => call('/weather?city=beijing')} className="rounded bg-slate-800 px-3 py-1">
        测试 Weather
      </button>
      <button
        onClick={() => call('/translate', 'POST', { text: '你好', target: 'en' })}
        className="rounded bg-slate-800 px-3 py-1"
      >
        测试 Translate
      </button>
      <pre className="rounded bg-slate-900 p-3 text-sm">{result || '（暂无结果）'}</pre>
    </div>
  );
}