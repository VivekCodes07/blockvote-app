
import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  Vote,
  Users,
  Blocks,
  ShieldCheck,
  Bell,
  Search,
  ArrowUpRight,
  Clock3,
  CheckCircle2,
  Menu,
  X,
  Fingerprint,
  Activity,
  ChevronRight,
  UserPlus,
  ArrowLeft,
  Mail,
  Lock,
  User,
  AlertCircle,
  Loader2,
} from "lucide-react";
import "./App.css";

const elections = [
  {
    title: "Student Council Election 2026",
    status: "Active",
    candidates: 6,
    votes: 1248,
    endDate: "Oct 25, 2026",
    color: "purple",
  },
  {
    title: "Technical Club Representative",
    status: "Upcoming",
    candidates: 4,
    votes: 0,
    endDate: "Oct 28, 2026",
    color: "blue",
  },
  {
    title: "Cultural Committee Election",
    status: "Completed",
    candidates: 5,
    votes: 986,
    endDate: "Oct 15, 2026",
    color: "green",
  },
];

const activities = [
  {
    icon: CheckCircle2,
    title: "Vote recorded successfully",
    detail: "Student Council Election",
    time: "2 minutes ago",
    color: "green",
  },
  {
    icon: Blocks,
    title: "New block added to chain",
    detail: "Block #1,249 · Hash verified",
    time: "18 minutes ago",
    color: "purple",
  },
  {
    icon: ShieldCheck,
    title: "Voter verification completed",
    detail: "Identity check successful",
    time: "32 minutes ago",
    color: "blue",
  },
];

function App() {
  const [activeNav, setActiveNav] = useState("Dashboard");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [search, setSearch] = useState("");
  const [backendStatus, setBackendStatus] = useState("checking"); // "checking" | "connected" | "disconnected"
  const [dbStatus, setDbStatus] = useState("checking"); // "checking" | "connected" | "disconnected"

  useEffect(() => {
    let isMounted = true;

    const checkBackendHealth = async () => {
      try {
        const response = await fetch("/api/health");
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        if (isMounted) {
          if (data && data.success === true && data.status === "healthy") {
            setBackendStatus("connected");
          } else {
            setBackendStatus("disconnected");
          }
        }
      } catch {
        if (isMounted) {
          setBackendStatus("disconnected");
        }
      }
    };

    const checkDbStatus = async () => {
      try {
        const response = await fetch("/api/db-status");
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        if (isMounted) {
          if (data && data.success === true && data.connected === true) {
            setDbStatus("connected");
          } else {
            setDbStatus("disconnected");
          }
        }
      } catch {
        if (isMounted) {
          setDbStatus("disconnected");
        }
      }
    };

    checkBackendHealth();
    checkDbStatus();
    const intervalId = setInterval(() => {
      checkBackendHealth();
      checkDbStatus();
    }, 10000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, []);

  const navigation = [
    { label: "Dashboard", icon: LayoutDashboard },
    { label: "Elections", icon: Vote },
    { label: "Voters", icon: Users },
    { label: "Blockchain Explorer", icon: Blocks },
  ];

  const filteredElections = elections.filter((election) =>
    election.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="app-shell">
      {mobileMenu && (
        <button
          className="mobile-overlay"
          aria-label="Close menu"
          onClick={() => setMobileMenu(false)}
        />
      )}

      <aside className={`sidebar ${mobileMenu ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-icon">
            <Blocks size={23} />
          </div>
          <div>
            <h2>BlockVote</h2>
            <span>SECURE ELECTIONS</span>
          </div>
          <button
            className="icon-button mobile-close"
            onClick={() => setMobileMenu(false)}
            aria-label="Close sidebar"
          >
            <X size={20} />
          </button>
        </div>

        <div className="workspace-label">WORKSPACE</div>

        <nav className="navigation">
          {navigation.map(({ label, icon: Icon }) => (
            <button
              key={label}
              className={`nav-item ${activeNav === label ? "nav-active" : ""}`}
              onClick={() => {
                setActiveNav(label);
                setMobileMenu(false);
              }}
            >
              <Icon size={19} />
              <span>{label}</span>
              {label === "Elections" && <span className="nav-count">3</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="security-card">
            <div className="security-icon">
              <ShieldCheck size={20} />
            </div>
            <h4>System services</h4>
            <p>Live platform connectivity</p>
            <div className="status-rows">
              <div className={`security-status ${backendStatus}`}>
                <span className={`status-dot ${backendStatus}`} />
                <span>
                  Backend:{" "}
                  {backendStatus === "connected"
                    ? "Connected"
                    : backendStatus === "checking"
                    ? "Checking..."
                    : "Offline"}
                </span>
              </div>
              <div className={`security-status ${dbStatus}`}>
                <span className={`status-dot ${dbStatus}`} />
                <span>
                  MongoDB:{" "}
                  {dbStatus === "connected"
                    ? "Connected"
                    : dbStatus === "checking"
                    ? "Checking..."
                    : "Disconnected"}
                </span>
              </div>
            </div>
          </div>

          <button
            className={`nav-item ${activeNav === "Settings" ? "nav-active" : ""}`}
            onClick={() => setActiveNav("Settings")}
          >
            <Activity size={19} />
            <span>System Settings</span>
          </button>

          <div className="profile">
            <div className="avatar">VK</div>
            <div className="profile-info">
              <strong>Voter Account</strong>
              <span>Verified member</span>
            </div>
            <ChevronRight size={17} className="profile-arrow" />
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <button
            className="icon-button menu-trigger"
            onClick={() => setMobileMenu(true)}
            aria-label="Open menu"
          >
            <Menu size={22} />
          </button>

          <div className="breadcrumb">
            <span>Workspace</span>
            <span className="breadcrumb-slash">/</span>
            <strong>{activeNav}</strong>
          </div>

          <div className="topbar-actions">
            <div className="search-box">
              <Search size={17} />
              <input
                placeholder="Search elections..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <kbd>⌘ K</kbd>
            </div>
            <button className="icon-button notification-button" aria-label="Notifications">
              <Bell size={19} />
              <span />
            </button>
            <div className="avatar top-avatar">VK</div>
          </div>
        </header>

        <div className="page-content">
          {activeNav === "Voters" || activeNav === "Register" ? (
            <VoterRegistrationView onBack={() => setActiveNav("Dashboard")} />
          ) : (
            <>
              <section className="welcome-row">
                <div>
                  <div className="eyebrow">
                    <span className="status-dot" />
                    ELECTION MANAGEMENT PORTAL
                  </div>
                  <h1>
                    Welcome back<span className="heading-period">.</span>
                  </h1>
                  <p className="welcome-subtitle">
                    Your elections, verified and transparent.
                  </p>
                </div>
                <div className="welcome-actions">
                  <button
                    className="secondary-action-button"
                    onClick={() => setActiveNav("Voters")}
                  >
                    <UserPlus size={16} />
                    Register voter
                  </button>
                  <button
                    className="primary-button"
                    onClick={() => setActiveNav("Elections")}
                  >
                    <Vote size={17} />
                    Explore elections
                    <ArrowUpRight size={16} />
                  </button>
                </div>
              </section>

              <section className="stats-grid">
                <StatCard
                  icon={Vote}
                  label="Total Elections"
                  value="12"
                  change="+2 this month"
                  tone="purple"
                />
                <StatCard
                  icon={Users}
                  label="Registered Voters"
                  value="2,486"
                  change="Register new voter"
                  tone="blue"
                  onClick={() => setActiveNav("Voters")}
                />
                <StatCard
                  icon={CheckCircle2}
                  label="Votes Recorded"
                  value="4,892"
                  change="Illustrative demo data"
                  tone="green"
                />
                <StatCard
                  icon={Blocks}
                  label="Blockchain Blocks"
                  value="4,892"
                  change="Demo chain overview"
                  tone="orange"
                />
              </section>

          <section className="content-grid">
            <div className="panel elections-panel">
              <div className="panel-heading">
                <div>
                  <div className="section-kicker">OVERVIEW</div>
                  <h2>Elections</h2>
                  <p>Track ongoing and upcoming campus elections.</p>
                </div>
                <button
                  className="text-button"
                  onClick={() => setActiveNav("Elections")}
                >
                  View all <ArrowUpRight size={15} />
                </button>
              </div>

              <div className="election-list">
                {filteredElections.length > 0 ? (
                  filteredElections.map((election) => (
                    <div className="election-item" key={election.title}>
                      <div className={`election-icon ${election.color}`}>
                        <Vote size={20} />
                      </div>
                      <div className="election-main">
                        <h3>{election.title}</h3>
                        <div className="election-meta">
                          <span>
                            <Users size={14} /> {election.candidates} candidates
                          </span>
                          <span>
                            <Clock3 size={14} /> Ends {election.endDate}
                          </span>
                        </div>
                        <div className="election-progress">
                          <span
                            className={`progress-fill ${election.color}`}
                            style={{
                              width:
                                election.status === "Completed"
                                  ? "100%"
                                  : election.status === "Active"
                                    ? "68%"
                                    : "0%",
                            }}
                          />
                        </div>
                      </div>
                      <div className="election-right">
                        <span className={`status-pill ${election.status.toLowerCase()}`}>
                          {election.status}
                        </span>
                        <strong>{election.votes.toLocaleString()}</strong>
                        <span className="vote-caption">votes</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="empty-state">
                    No elections match “{search}”.
                  </div>
                )}
              </div>
              <div className="panel-footer">
                <span>Showing demonstration data</span>
                <button onClick={() => setSearch("")}>Reset search</button>
              </div>
            </div>

            <div className="panel activity-panel">
              <div className="panel-heading">
                <div>
                  <div className="section-kicker">LIVE MONITOR</div>
                  <h2>Recent activity</h2>
                  <p>Illustrative system events.</p>
                </div>
                <span className="live-indicator">
                  <span className="status-dot" /> DEMO
                </span>
              </div>

              <div className="activity-list">
                {activities.map(({ icon: Icon, title, detail, time, color }) => (
                  <div className="activity-item" key={title}>
                    <div className={`activity-icon ${color}`}>
                      <Icon size={17} />
                    </div>
                    <div className="activity-copy">
                      <h4>{title}</h4>
                      <p>{detail}</p>
                      <span>{time}</span>
                    </div>
                  </div>
                ))}
              </div>

              <button
                className="activity-link"
                onClick={() => setActiveNav("Blockchain Explorer")}
              >
                Explore blockchain activity <ArrowUpRight size={15} />
              </button>
            </div>
          </section>

          <section className="blockchain-banner">
            <div className="banner-icon">
              <Fingerprint size={25} />
            </div>
            <div className="banner-copy">
              <div className="banner-title-row">
                <h3>Blockchain integrity overview</h3>
                <span className="demo-tag">PREVIEW</span>
              </div>
              <p>
                Each recorded block will link to the previous block's hash.
                Real validation will be connected in a later step.
              </p>
            </div>
            <div className="chain-status">
              <span className="chain-status-icon">
                <ShieldCheck size={17} />
              </span>
              <div>
                <strong>Preview mode</strong>
                <span>
                  {backendStatus === "connected" && "Backend connected · Chain unverified"}
                  {backendStatus === "checking" && "Checking backend..."}
                  {backendStatus === "disconnected" && "Backend offline"}
                </span>
              </div>
            </div>
            <button
              className="banner-button"
              onClick={() => setActiveNav("Blockchain Explorer")}
            >
              View explorer <ArrowUpRight size={16} />
            </button>
          </section>

          <footer className="page-footer">
            <span>BlockVote <span className="footer-dot">·</span> Academic project prototype</span>
            <span><ShieldCheck size={14} /> Transparency by design</span>
          </footer>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function VoterRegistrationView({ onBack }) {
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (error) setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const { fullName, email, password, confirmPassword } = formData;

    // Client-side validations
    if (!fullName.trim() || !email.trim() || !password || !confirmPassword) {
      setError("All fields are required.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim().toLowerCase(),
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.message || "Registration failed. Please try again.");
      } else {
        setSuccess({
          message: data.message,
          voter: data.voter,
        });
        // Clear sensitive password fields and reset form
        setFormData({
          fullName: "",
          email: "",
          password: "",
          confirmPassword: "",
        });
      }
    } catch {
      setError("Unable to connect to the server. Please check your network.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="registration-container">
      <button className="back-button" onClick={onBack}>
        <ArrowLeft size={15} />
        Back to Dashboard
      </button>

      <div className="registration-card">
        <div className="registration-header">
          <div className="registration-badge">
            <UserPlus size={14} />
            <span>VOTER ONBOARDING</span>
          </div>
          <h2>Register New Voter</h2>
          <p>
            Create an academic voter profile. Passwords are cryptographically hashed using bcrypt.
          </p>
        </div>

        {error && (
          <div className="form-alert error" role="alert">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="form-alert success" role="status">
            <CheckCircle2 size={18} />
            <div>
              <strong>{success.message}</strong>
              <p>Registered: {success.voter.fullName} ({success.voter.email})</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label htmlFor="reg-fullname">Full Name</label>
            <div className="input-wrapper">
              <User size={16} />
              <input
                id="reg-fullname"
                type="text"
                name="fullName"
                className="form-input"
                placeholder="e.g. Jane Doe"
                value={formData.fullName}
                onChange={handleChange}
                disabled={loading}
                autoComplete="name"
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="reg-email">Email Address</label>
            <div className="input-wrapper">
              <Mail size={16} />
              <input
                id="reg-email"
                type="email"
                name="email"
                className="form-input"
                placeholder="name@college.edu"
                value={formData.email}
                onChange={handleChange}
                disabled={loading}
                autoComplete="email"
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="reg-password">Password</label>
            <div className="input-wrapper">
              <Lock size={16} />
              <input
                id="reg-password"
                type="password"
                name="password"
                className="form-input"
                placeholder="Minimum 6 characters"
                value={formData.password}
                onChange={handleChange}
                disabled={loading}
                autoComplete="new-password"
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="reg-confirm-password">Confirm Password</label>
            <div className="input-wrapper">
              <Lock size={16} />
              <input
                id="reg-confirm-password"
                type="password"
                name="confirmPassword"
                className="form-input"
                placeholder="Re-enter password"
                value={formData.confirmPassword}
                onChange={handleChange}
                disabled={loading}
                autoComplete="new-password"
              />
            </div>
          </div>

          <button
            type="submit"
            className="submit-button"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="spinner" />
                Registering voter...
              </>
            ) : (
              <>
                <UserPlus size={16} />
                Register Voter
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, change, tone, onClick }) {
  return (
    <div
      className={`stat-card ${onClick ? "stat-card-clickable" : ""}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className={`stat-icon ${tone}`}>
        <Icon size={20} />
      </div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-change">
        <span className="change-arrow"><ArrowUpRight size={13} /></span>
        {change}
      </div>
    </div>
  );
}

export default App;
