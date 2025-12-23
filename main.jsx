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
  TrendingUp, 
  WifiOff 
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
  onAuthStateChanged 
} from 'firebase/auth';

// =========================================================
// 🔑 CONFIGURAÇÃO REAL DO FIREBASE (OPERACIONAL)
// =========================================================
const firebaseConfig = {
  apiKey: "AIzaSyD8si2zrFm0gTXf1IiFPMDKw2h9dU0cZYw",
  authDomain: "choque-pmpb.firebaseapp.com",
  projectId: "choque-pmpb",
  storageBucket: "choque-pmpb.firebasestorage.app",
  messagingSenderId: "20528860006",
  appId: "1:20528860006:web:c2556a032c5dd66e5896a7",
  measurementId: "G-FYR5CK21KG"
};

// Inicialização segura com logs para depuração
let app, auth, db;
try {
  app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
} catch (e) {
  console.error("ERRO DE CONEXÃO FIREBASE:", e);
}

const appId = 'choque-pmpb-oficial';

const App = () => {
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

  // Autenticação
  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (err) {
        console.error("Falha na autenticação anónima:", err);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Sincronização
  useEffect(() => {
    if (!user) return;
    const vRef = collection(db, 'artifacts', appId, 'public', 'data', 'veiculos');
    const q = query(vRef);
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setVehicles(data);
    }, (error) => {
      console.error("ERRO FIRESTORE:", error);
    });
    return () => unsubscribe();
  }, [user]);

  const stats = useMemo(() => {
    const active = vehicles.filter(v => v.status === 'ROUBADO').length;
    const recovered = vehicles.filter(v => v.status === 'RECUPERADO').length;
    return { active, recovered };
  }, [vehicles]);

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
        return new Date(b.timestamp || 0) - new Date(a.timestamp || 0);
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
      showNotification("Acesso autorizado.");
    } else {
      showNotification("Dados inválidos.", "error");
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!user) return;
    const placaNova = formData.placa.toUpperCase().trim();
    const jaExiste = vehicles.find(v => v.placa === placaNova && v.status === 'ROUBADO');

    if (jaExiste) {
      showNotification(`ALERTA: Placa ${placaNova} já activa!`, "error");
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
      showNotification("Alerta lançado!");
    } catch (err) {
      showNotification("Erro ao guardar.", "error");
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
        data_recuperacao: new Date().toLocaleString('pt-BR') 
      });
      showNotification(`VTR ${placa} recuperada.`);
    } catch (err) {
      showNotification("Erro na actualização.", "error");
    }
  };

  if (loading) return (
    <div className="h-screen bg-black flex flex-col items-center justify-center text-red-600 font-sans">
      <Loader2 className="animate-spin mb-4" size={48} />
      <span className="text-[10px] font-black uppercase tracking-widest text-center px-6">Sincronizando com o Batalhão...</span>
    </div>
  );

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 text-white text-center font-sans">
        <Shield size={64} className="text-red-600 mb-4 shadow-2xl shadow-red-600/20" />
        <h1 className="text-4xl font-black italic uppercase">Choque <span className="text-red-600">PMPB</span></h1>
        <form onSubmit={handleLogin} className="w-full max-w-sm mt-8 space-y-4 text-left">
          <input type="text" placeholder="Matrícula" className="w-full bg-zinc-900 border border-zinc-800 p-4 rounded-2xl text-white outline-none focus:border-red-600 px-4 py-3" onChange={(e) => setLoginForm({...loginForm, matricula: e.target.value})} required />
          <input type="password" placeholder="Senha Tática" className="w-full bg-zinc-900 border border-zinc-800 p-4 rounded-2xl text-white outline-none focus:border-red-600 px-4 py-3" onChange={(e) => setLoginForm({...loginForm, senha: e.target.value})} required />
          <button type="submit" className="w-full bg-red-600 text-white font-black py-4 rounded-2xl transition-all active:scale-95 uppercase tracking-widest">Aceder Sistema</button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col font-sans max-w-lg mx-auto border-x border-zinc-900">
      <header className="p-5 border-b border-zinc-900 flex items-center justify-between sticky top-0 bg-black/90 backdrop-blur-xl z-50">
        <div className="flex items-center gap-2">
          <Shield size={20} className="text-red-600" />
          <span className="font-black text-sm uppercase italic">Operacional Choque</span>
        </div>
        <button onClick={() => setAuthenticated(false)} className="text-zinc-600"><LogOut size={20} /></button>
      </header>

      <main className="flex-1 overflow-y-auto pb-32 p-4">
        {view === 'list' ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-zinc-900 p-4 rounded-3xl border border-red-900/20 text-center">
                <p className="text-[10px] font-black text-zinc-500 uppercase">Alertas</p>
                <span className="text-3xl font-black text-red-600">{stats.active}</span>
              </div>
              <div className="bg-zinc-900 p-4 rounded-3xl border border-zinc-800 text-center">
                <p className="text-[10px] font-black text-zinc-500 uppercase">Recuperados</p>
                <span className="text-3xl font-black text-green-500">{stats.recovered}</span>
              </div>
            </div>

            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600" size={18} />
              <input type="text" placeholder="Filtrar placa ou modelo..." className="w-full bg-zinc-900 border border-zinc-800 p-4 pl-12 rounded-2xl outline-none focus:border-red-600 text-white px-4 py-3" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
            
            <div className="space-y-4">
              {sortedVehicles.length === 0 ? (
                <div className="py-20 text-center opacity-10 flex flex-col items-center">
                  <Car size={64} className="mx-auto mb-4" />
                  <p className="font-bold uppercase text-xs">Sem ocorrências</p>
                </div>
              ) : (
                sortedVehicles.map((v) => (
                  <div key={v.id} className={`bg-zinc-900 border rounded-3xl p-5 transition-all ${v.status === 'ROUBADO' ? 'border-red-900/30' : 'opacity-40 grayscale border-zinc-800'}`}>
                    <div className="flex justify-between items-start">
                      <div>
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase ${v.status === 'ROUBADO' ? 'bg-red-600 text-white' : 'bg-zinc-800'}`}>{v.status}</span>
                        <h4 className="text-2xl font-black mt-2 leading-none uppercase">{v.placa || "S/ P"}</h4>
                        <p className="text-zinc-400 text-sm mt-1">{v.modelo}</p>
                      </div>
                      <div className="text-right text-[10px] text-zinc-600 font-bold leading-tight">
                        <Clock size={10} className="inline mr-1" /> {v.data}
                      </div>
                    </div>
                    <div className="mt-4 text-[10px] text-zinc-500 bg-black/40 p-3 rounded-xl flex items-center gap-2 border border-zinc-800/50">
                      <MapPin size={12} className="text-red-600 shrink-0" /> <span className="truncate">{v.local || "Não informado"}</span>
                    </div>
                    {v.status === 'ROUBADO' && (
                      <button onClick={() => markAsRecovered(v.id, v.placa)} className="w-full mt-4 bg-zinc-800 text-white text-[11px] font-black py-3.5 rounded-xl border border-zinc-700 transition-all active:scale-95 shadow-md uppercase">Marcar Recuperado</button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-6 animate-in slide-in-from-bottom-6 duration-500 p-2 font-sans">
            <h3 className="text-3xl font-black italic underline decoration-red-600 underline-offset-8 uppercase tracking-tighter">Novo Alerta</h3>
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <input type="text" placeholder="Placa" className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl uppercase outline-none focus:border-red-600 text-white px-4 py-3" value={formData.placa} onChange={(e) => setFormData({...formData, placa: e.target.value})} required />
                <select className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl text-zinc-400 outline-none px-4 py-3" value={formData.tipo} onChange={(e) => setFormData({...formData, tipo: e.target.value})} required>
                  <option value="">Tipo</option>
                  <option value="Carro">Carro</option>
                  <option value="Moto">Moto</option>
                  <option value="Outro">Outro</option>
                </select>
              </div>
              <input type="text" placeholder="Marca / Modelo" className="w-full bg-zinc-900 border border-zinc-800 p-4 rounded-2xl outline-none focus:border-red-600 text-white px-4 py-3" value={formData.modelo} onChange={(e) => setFormData({...formData, modelo: e.target.value})} required />
              <input type="text" placeholder="Local da Ocorrência" className="w-full bg-zinc-900 border border-zinc-800 p-4 rounded-2xl outline-none focus:border-red-600 text-white px-4 py-3" value={formData.local} onChange={(e) => setFormData({...formData, local: e.target.value})} required />
              <textarea placeholder="Observações..." className="w-full bg-zinc-900 border border-zinc-800 p-4 rounded-2xl h-24 resize-none outline-none focus:border-red-600 text-white px-4 py-3" value={formData.obs} onChange={(e) => setFormData({...formData, obs: e.target.value})} />
              <button type="submit" disabled={isSaving} className="w-full bg-red-600 text-white font-black py-5 rounded-2xl flex items-center justify-center gap-3 shadow-2xl transition-all active:scale-[0.98]">
                {isSaving ? <Loader2 className="animate-spin" size={24} /> : <Shield size={24} />} LANÇAR NA REDE
              </button>
              <button type="button" onClick={() => setView('list')} className="w-full text-zinc-600 text-[10px] font-black uppercase py-4">Cancelar</button>
            </form>
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto bg-zinc-950/90 backdrop-blur-xl border-t border-zinc-900 px-10 py-5 flex justify-around items-center rounded-t-[40px] z-50 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
        <button onClick={() => setView('list')} className={`flex flex-col items-center gap-1.5 transition-all ${view === 'list' ? 'text-red-600 scale-110' : 'text-zinc-700'}`}><Search size={22} /><span className="text-[8px] font-black uppercase">Monitor</span></button>
        <button onClick={() => setView('add')} className={`-mt-14 w-16 h-16 rounded-full flex items-center justify-center border-4 border-black transition-all active:scale-90 ${view === 'add' ? 'bg-white text-black' : 'bg-red-600 text-white shadow-red-600/40'}`}><PlusCircle size={32} /></button>
        <button className="flex flex-col items-center gap-1.5 text-zinc-900 opacity-20 cursor-not-allowed" disabled><History size={22} /><span className="text-[8px] font-black uppercase tracking-widest">Histórico</span></button>
      </nav>
      
      {notification && <div className={`fixed top-24 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg text-[10px] font-black uppercase border z-[60] shadow-2xl animate-in fade-in slide-in-from-top-4 ${notification.type === 'error' ? 'bg-red-950 border-red-600 text-white' : 'bg-zinc-900 border-zinc-800 text-green-500'}`}>{notification.msg}</div>}
    </div>
  );
};

export default App;