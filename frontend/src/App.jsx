import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';

const formatRupiah = (value) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(Number(value || 0));

export default function App() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchCampaigns = async () => {
      try {
        const { data, error } = await supabase
          .from('campaigns')
          .select('*')
          .eq('active', true)
          .order('id', { ascending: false });

        if (error) throw error;
        setCampaigns(data || []);
      } catch (err) {
        setError(err.message || 'Gagal memuat data kampanye.');
      } finally {
        setLoading(false);
      }
    };

    fetchCampaigns();
  }, []);

  if (loading) return <div className="page"><p>Memuat kampanye...</p></div>;

  return (
    <div className="page">
      <header className="topbar">
        <h1>QAF Berbagi</h1>
      </header>

      <main className="container">
        <section className="hero">
          <p className="eyebrow">Galang dana untuk aksi nyata</p>
          <h2>Berbagi untuk program Quranic Action Forum</h2>
        </section>

        {error ? (
          <div className="alert">{error}</div>
        ) : (
          <section className="grid">
            {campaigns.map((campaign) => {
              const collected = Number(campaign.collected || 0);
              const target = Number(campaign.target || 1);
              const progress = Math.min(100, Math.round((collected / target) * 100 || 0));

              return (
                <article key={campaign.id} className="card">
                  <span className="tag">{campaign.category}</span>
                  <h3>{campaign.title}</h3>
                  <p>{campaign.summary}</p>

                  <div className="progress">
                    <span style={{ width: `${progress}%` }} />
                  </div>

                  <div className="meta">
                    <strong>{formatRupiah(collected)}</strong>
                    <span> dari {formatRupiah(target)}</span>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </main>
    </div>
  );
}
