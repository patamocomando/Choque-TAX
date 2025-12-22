import React, { useState, useEffect, useMemo } from 'react';
import { 
  Shield, 
  PlusCircle, 
  Search, 
  CheckCircle2, 
  History, 
  AlertTriangle, 
  LogOut, 
  Clock,
  MapPin,
  Car,
  ChevronRight,
  Loader2,
  TrendingUp
} from 'lucide-react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  onSnapshot, 
  updateDoc, 
  doc,
  query 
} from 'firebase/firestore';
import { 
  getAuth, 
  signInAnonymously, 
  signInWithCustomToken,
  onAuthStateChanged 
} from 'firebase/auth';

// --- INICIALIZAÇÃO SEGURA DO FIREBASE ---
let app, auth, db;

try {
  // Verifica se a configuração está disponível no ambiente (Canvas)
  const config = typeof __firebase_config !== 'undefined' 
    ? JSON.parse(__firebase_config) 
    : {
        apiKey: "AIzaSyD8si2zrFm0gTXf1IiFPMDKw2h9dU0cZYw",
  authDomain: "choque-pmpb.firebaseapp.com",
  projectId: "choque-pmpb",
  storageBucket: "choque-pmpb.firebasestorage.app",
  messagingSenderId: "20528860006",
  appId: "1:20528860006:web:c2556a032c5dd66e5896a7",
  measurementId: "G-FYR5CK21KG"
      };

  app = getApps().length > 0 ? getApp() : initializeApp(config);
  auth = getAuth(app);
  db = getFirestore(app);
} catch (error) {
  console.error("Erro crítico na configuração do Firebase:", error);
}

const appId = typeof __app_id !== 'undefined' ? __app_id : 'choque-pmpb-v1';

export default function App() {
  const [user, setUser] = useState(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list');
  const [isSaving, setIsSaving] = useState(false);
  const [vehicles, setVehicles] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loginForm, setLoginForm] = useState({ matricula: '', senha: '' });
  const [notification, setNotification] = useState(null);

  const [formData, setFormData] = useState({
    tipo: '', placa: '', modelo: '', cor: '', ano: '', local: '', data: '', obs: ''
  });

  // 1. Inicialização da Autenticação (Regra 3 - Auth antes de Queries)
  useEffect(() => {
    const initAuth = async () => {
      if (!auth) {
        console.error("Serviço de autenticação não inicializado.");
        setLoading(false);
        return;
      }

      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Erro na ligação ao servidor de segurança:", err.message);
        showNotification("Erro de conexão com o servidor.", "error");
      }
    };

    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 2. Monitorização de Dados em Tempo Real (Firestore)
  useEffect(() => {
    if (!user || !db) return; // Regra 3 - Proteção de query

    const vRef = collection(db, 'artifacts', appId, 'public', 'data', 'veiculos');
    const q = query(vRef);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setVehicles(data);
    }, (err) => {
      console.error("Erro de sincronização Firestore:", err);
      showNotification("Erro de atualização da base.", "error");
    });

    return () => unsubscribe();
  }, [user]);

  // Estatísticas Rápidas
  const stats = useMemo(() => {
    const active = vehicles.filter(v => v.status === 'ROUBADO').length;
    const recovered = vehicles.filter(v => v.status === 'RECUPERADO').length;
    return { active, recovered };
  }, [vehicles]);

  // Ordenação: ROUBADOS (topo) > RECUPERADOS (baixo)
  const sortedVehicles = useMemo(() => {
    return vehicles
      .filter(v => 
        (v.placa?.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (v.modelo?.toLowerCase().includes(searchTerm.toLowerCase()))
      )
      .sort((a, b) => {
        const priorityA = a.status === 'ROUBADO' ? 0 : 1;
        const priorityB = b.status === 'ROUBADO' ? 0 : 1;
        if (priorityA !== priorityB) return priorityA - priorityB;
        return new Date(b.timestamp) - new Date(a.timestamp);
      });
  }, [vehicles, searchTerm]);

  const showNotification = (msg, type = "success") => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const handleLogin = (e) => {
    e.preventDefault();
    if (loginForm.matricula.trim() === 'admin' && loginForm.senha === 'choque123') {
      setAuthenticated(true);
      showNotification("Acesso autorizado. Operacional iniciado.");
    } else {
      showNotification("Matrícula ou Senha inválidas.", "error");
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!user) return;

    const placaNova = formData.placa.toUpperCase().trim();
    const jaExiste = vehicles.find(v => v.placa === placaNova && v.status === 'ROUBADO');

    if (jaExiste) {
      showNotification(`ALERTA: A placa ${placaNova} já está ativa no sistema!`, "error");
      return;
    }

    setIsSaving(true);
    const now = new Date();
    
    const payload = {
      ...formData,
      status: 'ROUBADO',
      timestamp: now.toISOString(),
      data: now.toLocaleString('pt-BR'),
      placa: placaNova,
      userId: user.uid
    };

    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'veiculos'), payload);
      setView('list');
      setFormData({ tipo: '', placa: '', modelo: '', cor: '', ano: '', local: '', data: '', obs: '' });
      showNotification("Alerta lançado na rede com sucesso!");
    } catch (err) {
      showNotification("Erro ao gravar dados na nuvem.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const markAsRecovered = async (id, placa) => {
    if (!user) return;
    try {
      const vRef = doc(db, 'artifacts', appId, 'public', 'data', 'veiculos', id);
      await updateDoc(vRef, { 
        status: 'RECUPERADO',
        data_recuperacao: new Date().toLocaleString('pt-BR'),
        recuperadoPor: user.uid
      });
      showNotification(`Veículo ${placa || "S/P"} recuperado.`);
    } catch (err) {
      showNotification("Erro na atualização do status.", "error");
    }
  };

  if (loading) return (
    <div className="h-screen bg-black flex flex-col items-center justify-center text-red-600 gap-4">
      <Loader2 className="animate-spin" size={48} />
      <span className="text-[10px] font-black uppercase tracking-widest animate-pulse">Estabelecendo Conexão Segura...</span>
    </div>
  );

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 text-white font-sans">
        <div className="w-full max-w-sm space-y-8 text-center">
          <div className="inline-block p-4 bg-red-600 rounded-full shadow-2xl shadow-red-600/20"><Shield size={48} /></div>
          <h1 className="text-4xl font-black tracking-tighter italic">CHOQUE <span className="text-red-600">PMPB</span></h1>
          <form onSubmit={handleLogin} className="space-y-4 text-left">
            <input type="text" placeholder="Matrícula" className="w-full bg-zinc-900 border border-zinc-800 p-4 rounded-2xl focus:border-red-600 focus:outline-none text-white" onChange={(e) => setLoginForm({...loginForm, matricula: e.target.value})} required />
            <input type="password" placeholder="Senha Tática" className="w-full bg-zinc-900 border border-zinc-800 p-4 rounded-2xl focus:border-red-600 focus:outline-none text-white" onChange={(e) => setLoginForm({...loginForm, senha: e.target.value})} required />
            <button type="submit" className="w-full bg-red-600 hover:bg-red-700 text-white font-black py-4 rounded-2xl transition-all active:scale-95 shadow-lg shadow-red-600/20">ACESSAR SISTEMA</button>
          </form>
          <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest">Uso Exclusivo Policial - Paraíba</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-zinc-100 flex flex-col font-sans max-w-lg mx-auto border-x border-zinc-900 relative">
      <header className="p-5 border-b border-zinc-900 flex items-center justify-between sticky top-0 bg-black/80 backdrop-blur-lg z-50">
        <div className="flex items-center gap-3">
          <Shield size={20} className="text-red-600" />
          <h2 className="font-black text-sm uppercase">OPERACIONAL <span className="text-red-600">CHOQUE</span></h2>
        </div>
        <button onClick={() => setAuthenticated(false)} className="text-zinc-600 hover:text-red-600 transition-colors"><LogOut size={20} /></button>
      </header>

      <main className="flex-1 overflow-y-auto pb-32">
        {view === 'list' ? (
          <div className="p-4 space-y-6">
            {/* Dashboard Minimalista */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-zinc-900/60 p-4 rounded-3xl border border-red-900/20">
                <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Alertas Ativos</p>
                <div className="flex items-end gap-2 mt-2">
                  <span className="text-3xl font-black text-red-600 leading-none">{stats.active}</span>
                  <AlertTriangle size={14} className="text-red-600 mb-1" />
                </div>
              </div>
              <div className="bg-zinc-900/60 p-4 rounded-3xl border border-zinc-800">
                <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Recuperados</p>
                <div className="flex items-end gap-2 mt-2">
                  <span className="text-3xl font-black text-green-500 leading-none">{stats.recovered}</span>
                  <TrendingUp size={14} className="text-green-500 mb-1" />
                </div>
              </div>
            </div>

            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600" size={18} />
              <input type="text" placeholder="Pesquisar placa ou modelo..." className="w-full bg-zinc-900 border border-zinc-800 p-4 pl-12 rounded-2xl focus:border-red-600 focus:outline-none text-white" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
            
            <div className="space-y-4">
              {sortedVehicles.length === 0 ? (
                <div className="py-20 text-center opacity-20"><Car size={64} className="mx-auto mb-4" /><p className="font-bold">Sem registros na base.</p></div>
              ) : (
                sortedVehicles.map((v) => (
                  <div key={v.id} className={`bg-zinc-900/40 border rounded-3xl p-5 transition-all ${v.status === 'ROUBADO' ? 'border-red-900/30 ring-1 ring-red-600/5 shadow-lg shadow-red-900/10' : 'opacity-40 grayscale border-zinc-800'}`}>
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${v.status === 'ROUBADO' ? 'bg-red-600 text-white' : 'bg-zinc-800 text-zinc-400'}`}>{v.status}</span>
                        <h4 className="text-2xl font-black text-white mt-1 leading-none">{v.placa || "S/ PLACA"}</h4>
                        <p className="text-zinc-400 text-sm font-medium">{v.modelo}</p>
                      </div>
                      <div className="text-right text-[10px] text-zinc-500 font-bold leading-tight">
                        <Clock size={10} className="inline mr-1" /> {v.data}
                        <div className="text-zinc-400 uppercase mt-1">{v.cor}</div>
                      </div>
                    </div>
                    <div className="text-[10px] text-zinc-500 bg-black/40 p-3 rounded-xl flex items-center gap-2 border border-zinc-800/50">
                      <MapPin size={12} className="text-red-600 shrink-0" /> <span className="truncate">{v.local || "Local não informado"}</span>
                    </div>
                    {v.status === 'ROUBADO' && (
                      <button onClick={() => markAsRecovered(v.id, v.placa)} className="w-full mt-4 bg-zinc-800 hover:bg-zinc-700 text-white text-[11px] font-black py-3 rounded-xl flex items-center justify-center gap-2 border border-zinc-700 transition-colors">
                        <CheckCircle2 size={16} className="text-green-500" /> MARCAR COMO RECUPERADO
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="p-6 space-y-6 animate-in slide-in-from-bottom-6 duration-500">
            <div>
              <h3 className="text-3xl font-black text-white italic underline decoration-red-600 underline-offset-8">NOVO REGISTRO</h3>
              <p className="text-red-600 text-[10px] font-black uppercase tracking-widest mt-1">Lançamento Imediato na Rede</p>
            </div>
            
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <input type="text" placeholder="Placa" className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl focus:border-red-600 focus:outline-none uppercase text-white" value={formData.placa} onChange={(e) => setFormData({...formData, placa: e.target.value})} required />
                <select className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl focus:border-red-600 focus:outline-none text-zinc-400 appearance-none" value={formData.tipo} onChange={(e) => setFormData({...formData, tipo: e.target.value})} required>
                  <option value="">Tipo</option><option value="Carro">Carro</option><option value="Moto">Moto</option><option value="Caminhão">Caminhão</option><option value="Outro">Outro</option>
                </select>
              </div>
              <input type="text" placeholder="Marca / Modelo" className="w-full bg-zinc-900 border border-zinc-800 p-4 rounded-2xl focus:border-red-600 focus:outline-none text-white" value={formData.modelo} onChange={(e) => setFormData({...formData, modelo: e.target.value})} required />
              <div className="grid grid-cols-2 gap-4">
                <input type="text" placeholder="Cor" className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl focus:border-red-600 focus:outline-none text-white" value={formData.cor} onChange={(e) => setFormData({...formData, cor: e.target.value})} />
                <input type="text" placeholder="Ano" className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl focus:border-red-600 focus:outline-none text-white" value={formData.ano} onChange={(e) => setFormData({...formData, ano: e.target.value})} />
              </div>
              <input type="text" placeholder="Local da Ocorrência" className="w-full bg-zinc-900 border border-zinc-800 p-4 rounded-2xl focus:border-red-600 focus:outline-none text-white" value={formData.local} onChange={(e) => setFormData({...formData, local: e.target.value})} required />
              <textarea placeholder="Observações Táticas" className="w-full bg-zinc-900 border border-zinc-800 p-4 rounded-2xl focus:border-red-600 focus:outline-none h-24 resize-none text-white" value={formData.obs} onChange={(e) => setFormData({...formData, obs: e.target.value})} />
              
              <div className="pt-4">
                <button type="submit" disabled={isSaving} className="w-full bg-red-600 hover:bg-red-700 text-white font-black py-5 rounded-2xl flex items-center justify-center gap-3 transition-all shadow-xl shadow-red-600/20">
                  {isSaving ? <Loader2 className="animate-spin" /> : <Shield size={20} />} PUBLICAR ALERTA
                </button>
                <button type="button" onClick={() => setView('list')} className="w-full text-zinc-600 text-[10px] font-black uppercase py-4 tracking-widest hover:text-white transition-colors">Cancelar Lançamento</button>
              </div>
            </form>
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto bg-zinc-950/90 backdrop-blur-xl border-t border-zinc-900 px-10 py-5 flex justify-around items-center rounded-t-[40px] z-50 shadow-[0_-10px_40px_rgba(0,0,0,0.9)]">
        <button onClick={() => setView('list')} className={`flex flex-col items-center gap-1.5 transition-all ${view === 'list' ? 'text-red-600 scale-110' : 'text-zinc-700'}`}>
          <Search size={22} />
          <span className="text-[8px] font-black uppercase tracking-widest">Monitor</span>
        </button>
        <button onClick={() => setView('add')} className={`-mt-14 w-16 h-16 rounded-full flex items-center justify-center shadow-2xl border-4 border-black transition-all active:scale-90 ${view === 'add' ? 'bg-white text-black' : 'bg-red-600 text-white shadow-red-600/40'}`}>
          <PlusCircle size={32} />
        </button>
        <button className="flex flex-col items-center gap-1.5 text-zinc-900 opacity-20 cursor-not-allowed" disabled>
          <History size={22} />
          <span className="text-[8px] font-black uppercase tracking-widest">Histórico</span>
        </button>
      </nav>
      
      {notification && <div className={`fixed top-24 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest border z-[60] animate-in fade-in slide-in-from-top-4 ${notification.type === 'error' ? 'bg-red-950 border-red-600 text-white' : 'bg-zinc-900 border-zinc-800 text-green-500'}`}>{notification.msg}</div>}
    </div>
  );
}