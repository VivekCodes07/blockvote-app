import { useState, useEffect } from "react";
import {
  ArrowLeft,
  Trophy,
  Users,
  Vote,
  ShieldCheck,
  AlertCircle,
  Loader2,
  RefreshCw,
  Award,
  TrendingUp,
  LogIn,
  CheckCircle2,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from "recharts";

const formatDateTime = (dateStr) => {
  if (!dateStr) return "N/A";
  const d = new Date(dateStr);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const getInitials = (name) => {
  if (!name) return "VK";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

// Static Custom Recharts Tooltip
function ResultsTooltip({ active, payload }) {
  if (active && payload && payload.length) {
    const item = payload[0].payload;
    return (
      <div className="results-tooltip">
        <p className="tooltip-title">{item.fullName}</p>
        <p className="tooltip-party">{item.party}</p>
        <div className="tooltip-stat">
          <span>Votes:</span>
          <strong>{item.voteCount.toLocaleString()}</strong>
        </div>
        <div className="tooltip-stat">
          <span>Vote Share:</span>
          <strong>{item.votePercentage}%</strong>
        </div>
      </div>
    );
  }
  return null;
}

export default function ElectionResultsView({
  electionId,
  currentUser,
  onBack,
  onGoToLogin,
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (!electionId || !currentUser?.token) return;
    setRefreshing(true);
    try {
      const res = await fetch(`/api/elections/${electionId}/results`, {
        headers: {
          Authorization: `Bearer ${currentUser.token}`,
        },
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || "Failed to load election results.");
      }

      setData(json);
      setError(null);
    } catch (err) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    if (!electionId) return;

    if (!currentUser?.token) {
      return;
    }

    fetch(`/api/elections/${electionId}/results`, {
      headers: {
        Authorization: `Bearer ${currentUser.token}`,
      },
    })
      .then((res) => res.json().then((json) => ({ ok: res.ok, json })))
      .then(({ ok, json }) => {
        if (!isMounted) return;
        if (!ok) {
          setError(json.message || "Failed to load election results.");
        } else {
          setData(json);
          setError(null);
        }
        setLoading(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err.message || "An unexpected error occurred.");
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [electionId, currentUser?.token]);

  if (!currentUser) {
    return (
      <div className="election-detail-container">
        <button type="button" className="back-link" onClick={onBack}>
          <ArrowLeft size={15} />
          Back to all elections
        </button>

        <div className="voter-status-banner inactive" style={{ marginTop: "20px" }}>
          <LogIn size={22} />
          <div>
            <strong>Sign In Required to View Results</strong>
            <p>
              Certified election results and candidate tallies are available to registered voters and administrators.
            </p>
          </div>
          <button
            type="button"
            className="primary-button"
            onClick={onGoToLogin}
            style={{ marginLeft: "auto" }}
          >
            <LogIn size={14} />
            Sign In Now
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="election-detail-container">
        <button type="button" className="back-link" onClick={onBack}>
          <ArrowLeft size={15} />
          Back to all elections
        </button>
        <div className="empty-elections-card" style={{ padding: "60px 20px" }}>
          <Loader2 size={32} className="spinner" />
          <p style={{ marginTop: "12px", color: "#94a3b8" }}>
            Aggregating ballot records and calculating certified results...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="election-detail-container">
        <button type="button" className="back-link" onClick={onBack}>
          <ArrowLeft size={15} />
          Back to all elections
        </button>
        <div className="form-alert error" style={{ marginTop: "20px" }}>
          <AlertCircle size={20} />
          <div>
            <strong>Results Unavailable</strong>
            <p style={{ margin: "4px 0 0 0", fontSize: "13px" }}>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  const { election, results } = data || {};
  const candidates = results?.candidates || [];
  const totalVotes = results?.totalVotes || 0;
  const isTie = results?.isTie || false;
  const winner = results?.winner || null;
  const winners = results?.winners || [];

  // Prepare chart dataset
  const chartData = candidates.map((cand) => ({
    name: cand.name.length > 18 ? cand.name.substring(0, 16) + "..." : cand.name,
    fullName: cand.name,
    party: cand.party,
    voteCount: cand.voteCount,
    votePercentage: cand.votePercentage,
    isWinner: isTie
      ? winners.some((w) => w.id === cand.id)
      : winner?.id === cand.id,
  }));

  const maxVotes = Math.max(...candidates.map((c) => c.voteCount), 1);

  return (
    <div className="election-detail-container results-page-fadein">
      <div className="results-top-actions">
        <button type="button" className="back-link" onClick={onBack}>
          <ArrowLeft size={15} />
          Back to Campus Elections
        </button>

        <button
          type="button"
          className="refresh-btn"
          onClick={handleRefresh}
          disabled={refreshing}
          title="Refresh results"
        >
          <RefreshCw size={14} className={refreshing ? "spinner" : ""} />
          {refreshing ? "Updating..." : "Refresh"}
        </button>
      </div>

      {/* Hero Header */}
      <div className="results-hero">
        <div className="hero-top-row">
          <div className="hero-title-group">
            <div className="results-badges-row">
              <span className="status-pill completed">Completed</span>
              <span className="certified-badge">
                <ShieldCheck size={13} />
                Certified Final Tally
              </span>
            </div>
            <h2>{election?.title}</h2>
            <p className="hero-description">{election?.description}</p>
          </div>
        </div>

        <div className="hero-info-grid">
          <div className="hero-info-box">
            <span className="hero-info-label">Voting Commenced</span>
            <span className="hero-info-value">{formatDateTime(election?.startDate)}</span>
          </div>
          <div className="hero-info-box">
            <span className="hero-info-label">Voting Concluded</span>
            <span className="hero-info-value">{formatDateTime(election?.endDate)}</span>
          </div>
          <div className="hero-info-box">
            <span className="hero-info-label">Candidates Nominated</span>
            <span className="hero-info-value">{election?.candidateCount || 0}</span>
          </div>
          <div className="hero-info-box">
            <span className="hero-info-label">Total Ballots Cast</span>
            <span className="hero-info-value">{totalVotes.toLocaleString()} votes</span>
          </div>
        </div>
      </div>

      {/* Winner Showcase Card */}
      <div className="winner-announcement-section">
        {totalVotes === 0 ? (
          <div className="winner-banner zero-votes">
            <div className="winner-trophy-badge neutral">
              <Vote size={26} />
            </div>
            <div className="winner-details-col">
              <div className="winner-subtitle">ELECTION CONCLUDED</div>
              <h3 className="winner-title">No Votes Cast in this Election</h3>
              <p className="winner-desc">
                The voting period has ended, but 0 ballots were cast before the election closed. No winner is declared.
              </p>
            </div>
          </div>
        ) : isTie ? (
          <div className="winner-banner tie-result">
            <div className="winner-trophy-badge tie">
              <Users size={26} />
            </div>
            <div className="winner-details-col">
              <div className="winner-subtitle">ELECTORAL TIE DETECTED</div>
              <h3 className="winner-title">
                Deadlock: {winners.length} Candidates Tied for First Place
              </h3>
              <p className="winner-desc">
                The following candidates tied with an equal top vote share of{" "}
                <strong>{winners[0]?.voteCount} votes</strong> ({winners[0]?.votePercentage}% each):
              </p>
              <div className="tied-candidates-list">
                {winners.map((w) => (
                  <div className="tied-candidate-chip" key={w.id}>
                    <Award size={14} />
                    <strong>{w.name}</strong>
                    <span>({w.party})</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : winner ? (
          <div className="winner-banner decisive-winner">
            <div className="winner-trophy-badge gold">
              <Trophy size={28} />
            </div>
            <div className="winner-details-col">
              <div className="winner-subtitle">
                <CheckCircle2 size={13} />
                DECLARED ELECTED BY MAJORITY VOTE
              </div>
              <h3 className="winner-title">{winner.name}</h3>
              <p className="winner-party-title">{winner.party}</p>
              <div className="winner-metrics-row">
                <div className="winner-metric">
                  <span className="winner-metric-num">{winner.voteCount.toLocaleString()}</span>
                  <span className="winner-metric-label">Votes Won</span>
                </div>
                <div className="winner-metric-divider" />
                <div className="winner-metric">
                  <span className="winner-metric-num">{winner.votePercentage}%</span>
                  <span className="winner-metric-label">Vote Share</span>
                </div>
                <div className="winner-metric-divider" />
                <div className="winner-metric">
                  <span className="winner-metric-num">
                    {candidates.length > 1
                      ? `+${(winner.voteCount - (candidates[1]?.voteCount || 0)).toLocaleString()}`
                      : "Uncontested"}
                  </span>
                  <span className="winner-metric-label">Margin of Victory</span>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* KPI Stats Grid */}
      <div className="results-kpi-grid">
        <div className="results-kpi-card">
          <div className="kpi-icon blue">
            <Vote size={18} />
          </div>
          <div className="kpi-info">
            <span className="kpi-label">Total Verified Ballots</span>
            <h4 className="kpi-val">{totalVotes.toLocaleString()}</h4>
            <span className="kpi-sub">Anonymous votes counted</span>
          </div>
        </div>

        <div className="results-kpi-card">
          <div className="kpi-icon purple">
            <TrendingUp size={18} />
          </div>
          <div className="kpi-info">
            <span className="kpi-label">Registered Voter Turnout</span>
            <h4 className="kpi-val">{election?.turnoutPercentage || 0}%</h4>
            <span className="kpi-sub">
              {totalVotes} of {election?.totalRegisteredVoters || 0} registered
            </span>
          </div>
        </div>

        <div className="results-kpi-card">
          <div className="kpi-icon green">
            <Users size={18} />
          </div>
          <div className="kpi-info">
            <span className="kpi-label">Nominated Slate</span>
            <h4 className="kpi-val">{candidates.length}</h4>
            <span className="kpi-sub">Total candidates on ballot</span>
          </div>
        </div>

        <div className="results-kpi-card">
          <div className="kpi-icon amber">
            <ShieldCheck size={18} />
          </div>
          <div className="kpi-info">
            <span className="kpi-label">Electoral Integrity</span>
            <h4 className="kpi-val">100%</h4>
            <span className="kpi-sub">One-vote constraint enforced</span>
          </div>
        </div>
      </div>

      {/* Main Analytics: Chart & Detailed Standings */}
      <div className="results-main-grid">
        {/* Visual Chart Panel */}
        <div className="panel results-chart-card">
          <div className="panel-heading">
            <div>
              <div className="section-kicker">DATA VISUALIZATION</div>
              <h3>Candidate Vote Distribution</h3>
              <p>Relative vote counts and ballot shares across all contenders.</p>
            </div>
          </div>

          {candidates.length === 0 ? (
            <div className="empty-chart-box">
              <Users size={28} />
              <p>No candidates were nominated for this election.</p>
            </div>
          ) : totalVotes === 0 ? (
            <div className="empty-chart-box">
              <Vote size={28} />
              <p>Zero votes were cast. No distribution data available.</p>
            </div>
          ) : (
            <div className="chart-container" style={{ width: "100%", height: Math.max(220, candidates.length * 54) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={chartData}
                  margin={{ top: 12, right: 30, left: 10, bottom: 12 }}
                >
                  <XAxis
                    type="number"
                    stroke="#64748b"
                    domain={[0, maxVotes]}
                    allowDecimals={false}
                    tick={{ fill: "#94a3b8", fontSize: 12 }}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    stroke="#64748b"
                    width={110}
                    tick={{ fill: "#e2e8f0", fontSize: 12 }}
                  />
                  <Tooltip content={<ResultsTooltip />} cursor={{ fill: "rgba(255, 255, 255, 0.04)" }} />
                  <Bar dataKey="voteCount" radius={[0, 6, 6, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.isWinner ? "#10b981" : "#6366f1"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Candidate Standings Ranking Table */}
        <div className="panel results-standings-card">
          <div className="panel-heading">
            <div>
              <div className="section-kicker">CERTIFIED STANDINGS</div>
              <h3>Ranked Candidate Results</h3>
              <p>Final vote counts and percentage shares.</p>
            </div>
          </div>

          <div className="standings-list">
            {candidates.map((cand, index) => {
              const isWinnerCand = isTie
                ? winners.some((w) => w.id === cand.id)
                : winner?.id === cand.id;

              return (
                <div
                  className={`standing-item ${isWinnerCand ? "winner-standing" : ""}`}
                  key={cand.id}
                >
                  <div className="standing-rank-badge">
                    {index === 0 && !isTie && totalVotes > 0 ? (
                      <Trophy size={14} className="trophy-icon-rank" />
                    ) : (
                      `#${index + 1}`
                    )}
                  </div>

                  <div className="standing-avatar">
                    {cand.imageUrl ? (
                      <img
                        src={cand.imageUrl}
                        alt={cand.name}
                        onError={(e) => {
                          e.target.style.display = "none";
                        }}
                      />
                    ) : (
                      getInitials(cand.name)
                    )}
                  </div>

                  <div className="standing-details">
                    <div className="standing-name-row">
                      <span className="standing-name">{cand.name}</span>
                      <span className="standing-party">{cand.party}</span>
                      {isWinnerCand && totalVotes > 0 && (
                        <span className="winner-tag">
                          {isTie ? "Tied Winner" : "Winner"}
                        </span>
                      )}
                    </div>

                    <div className="standing-progress-wrapper">
                      <div
                        className={`standing-progress-fill ${
                          isWinnerCand ? "winner-fill" : ""
                        }`}
                        style={{ width: `${cand.votePercentage}%` }}
                      />
                    </div>
                  </div>

                  <div className="standing-votes-col">
                    <span className="standing-votes-num">
                      {cand.voteCount.toLocaleString()}
                    </span>
                    <span className="standing-votes-pct">{cand.votePercentage}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Privacy & Security Guarantee Banner */}
      <div className="privacy-assurance-card">
        <div className="privacy-icon">
          <ShieldCheck size={22} />
        </div>
        <div className="privacy-copy">
          <h4>Cryptographic Voter Anonymity &amp; Ballot Integrity</h4>
          <p>
            BlockVote enforces strict separation between voter participation records and anonymous ballots.
            No individual vote can ever be reverse-engineered to identify the voter who cast it.
            All tallies above represent immutable aggregate ballot counts.
          </p>
        </div>
      </div>
    </div>
  );
}
