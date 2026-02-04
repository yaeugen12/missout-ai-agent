import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { apiFetch } from "@/lib/api";
import {
  Activity,
  TrendingUp,
  TrendingDown,
  Users,
  Zap,
  Shield,
  Brain,
  AlertTriangle,
  CheckCircle,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";

interface AgentStatus {
  running: boolean;
  uptime?: number;
  metrics: {
    poolsMonitored: number;
    decisionsExecuted: number;
    fraudDetected: number;
    uptimeSeconds?: number;
  };
  subAgents: {
    poolOrchestrator: { running: boolean };
    securityAgent: { running: boolean };
    analyticsAgent: { running: boolean };
    tokenSafetyAgent: { running: boolean };
  };
}

interface Analytics {
  currentMetrics?: {
    totalPools: number;
    activePools: number;
    totalTransactions: number;
    totalVolume: number;
    uniqueParticipants: number;
    averagePoolSize: number;
    timestamp: string;
  };
  metrics?: {
    totalPools: number;
    activePools: number;
    totalTransactions: number;
    totalVolume: number;
    uniqueParticipants: number;
    averagePoolSize: number;
  };
  recentInsights?: Array<{
    type: string;
    trend: 'increasing' | 'stable' | 'decreasing';
    change: number;
    description: string;
    confidence: number;
  }>;
  trends?: Array<{
    type: string;
    trend: 'increasing' | 'stable' | 'decreasing';
    change: number;
    description: string;
    confidence: number;
  }>;
  predictions?: Array<{
    prediction: string;
    probability: number;
    timeframe: string;
  }>;
}

interface SecurityReport {
  totalIncidents: number;
  recentIncidents: Array<{
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    timestamp: Date;
  }>;
  walletRisks: Array<{
    wallet: string;
    riskScore: number;
    reasons: string[];
  }>;
}

export default function AgentDashboard() {
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [security, setSecurity] = useState<SecurityReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 5000); // Refresh every 5s
    return () => clearInterval(interval);
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [statusRes, analyticsRes, securityRes] = await Promise.all([
        apiFetch('/api/agent/status'),
        apiFetch('/api/agent/analytics'),
        apiFetch('/api/agent/security'),
      ]);

      const statusData = await statusRes.json();
      const analyticsData = await analyticsRes.json();
      const securityData = await securityRes.json();

      setAgentStatus(statusData.data);
      setAnalytics(analyticsData.data);
      setSecurity(securityData.data);
      setLoading(false);
    } catch (error) {
      console.error('Dashboard fetch error:', error);
    }
  };

  if (loading || !agentStatus || !analytics || !security) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="flex items-center gap-3">
          <Activity className="w-8 h-8 animate-pulse text-primary" />
          <span className="text-xl font-tech text-white">Loading AI Dashboard...</span>
        </div>
      </div>
    );
  }

  // Defensive defaults - support both API formats
  const metrics = analytics.currentMetrics || analytics.metrics || {
    totalPools: 0,
    activePools: 0,
    totalTransactions: 0,
    totalVolume: 0,
    uniqueParticipants: 0,
    averagePoolSize: 0,
  };
  const trends = analytics.recentInsights || analytics.trends || [];
  const predictions = analytics.predictions || [];

  const formatUptime = (seconds?: number) => {
    if (!seconds || isNaN(seconds)) return '0h 0m';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center gap-3 mb-2">
            <Brain className="w-8 h-8 text-primary" />
            <h1 className="text-4xl font-tech font-bold">AI Agent Dashboard</h1>
          </div>
          <p className="text-muted-foreground">Real-time autonomous intelligence monitoring</p>
        </motion.div>

        {/* Agent Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 border-green-500/20 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-green-400" />
                <span className="text-sm font-tech uppercase text-muted-foreground">Status</span>
              </div>
              <Badge className="bg-green-500/20 text-green-400 border-green-500/50">
                {agentStatus.running ? 'ONLINE' : 'OFFLINE'}
              </Badge>
            </div>
            <div className="text-3xl font-mono font-bold text-green-400">
              {formatUptime(agentStatus.metrics.uptimeSeconds || agentStatus.uptime)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Uptime</div>
          </Card>

          <Card className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border-blue-500/20 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Zap className="w-5 h-5 text-blue-400" />
              <span className="text-sm font-tech uppercase text-muted-foreground">Decisions</span>
            </div>
            <div className="text-3xl font-mono font-bold text-blue-400">
              {agentStatus.metrics.decisionsExecuted}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Total executed</div>
          </Card>

          <Card className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border-purple-500/20 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="w-5 h-5 text-purple-400" />
              <span className="text-sm font-tech uppercase text-muted-foreground">Pools</span>
            </div>
            <div className="text-3xl font-mono font-bold text-purple-400">
              {agentStatus.metrics.poolsMonitored}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Monitored</div>
          </Card>

          <Card className="bg-gradient-to-br from-red-500/10 to-orange-500/10 border-red-500/20 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-5 h-5 text-red-400" />
              <span className="text-sm font-tech uppercase text-muted-foreground">Security</span>
            </div>
            <div className="text-3xl font-mono font-bold text-red-400">
              {agentStatus.metrics.fraudDetected}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Threats blocked</div>
          </Card>
        </div>

        {/* Platform Metrics */}
        <Card className="bg-black/40 border-white/10 p-6 mb-8">
          <h2 className="text-xl font-tech font-bold mb-6 flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            Platform Metrics
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
              <div className="text-2xl font-mono font-bold text-white">
                {metrics.totalPools}
              </div>
              <div className="text-xs text-muted-foreground mt-1">Total Pools</div>
            </div>
            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
              <div className="text-2xl font-mono font-bold text-green-400">
                {metrics.activePools}
              </div>
              <div className="text-xs text-muted-foreground mt-1">Active Pools</div>
            </div>
            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
              <div className="text-2xl font-mono font-bold text-white">
                {metrics.totalTransactions}
              </div>
              <div className="text-xs text-muted-foreground mt-1">Transactions</div>
            </div>
            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
              <div className="text-2xl font-mono font-bold text-purple-400">
                {metrics.totalVolume.toFixed(2)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">Total Volume</div>
            </div>
            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
              <div className="text-2xl font-mono font-bold text-blue-400">
                {metrics.uniqueParticipants}
              </div>
              <div className="text-xs text-muted-foreground mt-1">Unique Users</div>
            </div>
            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
              <div className="text-2xl font-mono font-bold text-cyan-400">
                {metrics.averagePoolSize.toFixed(1)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">Avg Pool Size</div>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Trends */}
          <Card className="bg-black/40 border-white/10 p-6">
            <h2 className="text-xl font-tech font-bold mb-6 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              AI Trend Analysis
            </h2>
            <div className="space-y-4">
              {trends.length > 0 ? (
                trends.slice(0, 5).map((trend, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className="p-4 bg-white/5 rounded-lg border border-white/10 flex items-start gap-3"
                  >
                    {trend.trend === 'increasing' ? (
                      <ArrowUpRight className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                    ) : trend.trend === 'decreasing' ? (
                      <ArrowDownRight className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                    ) : (
                      <Activity className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium">{trend.description}</span>
                        <Badge className={`text-xs ${
                          trend.trend === 'increasing' 
                            ? 'bg-green-500/20 text-green-400 border-green-500/50'
                            : trend.trend === 'decreasing'
                            ? 'bg-red-500/20 text-red-400 border-red-500/50'
                            : 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50'
                        }`}>
                          {trend.change > 0 ? '+' : ''}{trend.change.toFixed(1)}%
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <div className="flex-1 h-1.5 bg-black/50 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-primary to-blue-500"
                            style={{ width: `${trend.confidence * 100}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {(trend.confidence * 100).toFixed(0)}% confidence
                        </span>
                      </div>
                    </div>
                  </motion.div>
                ))
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  <Activity className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>Collecting data for trend analysis...</p>
                </div>
              )}
            </div>
          </Card>

          {/* Predictions */}
          <Card className="bg-black/40 border-white/10 p-6">
            <h2 className="text-xl font-tech font-bold mb-6 flex items-center gap-2">
              <Brain className="w-5 h-5 text-primary" />
              AI Predictions
            </h2>
            <div className="space-y-4">
              {predictions.length > 0 ? (
                predictions.slice(0, 5).map((pred, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className="p-4 bg-gradient-to-br from-purple-500/10 to-blue-500/10 border border-purple-500/20 rounded-lg"
                  >
                    <div className="flex items-start gap-3">
                      <Brain className="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm leading-relaxed mb-3">{pred.prediction}</p>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Clock className="w-3 h-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">{pred.timeframe}</span>
                          </div>
                          <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/50 text-xs">
                            {(pred.probability * 100).toFixed(0)}% probability
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  <Brain className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>Generating predictions...</p>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Security Incidents */}
        {security.recentIncidents.length > 0 && (
          <Card className="bg-black/40 border-white/10 p-6 mt-8">
            <h2 className="text-xl font-tech font-bold mb-6 flex items-center gap-2">
              <Shield className="w-5 h-5 text-red-400" />
              Security Incidents ({security.totalIncidents} total)
            </h2>
            <div className="space-y-3">
              {security.recentIncidents.slice(0, 5).map((incident, idx) => (
                <div
                  key={idx}
                  className={`p-4 rounded-lg border flex items-start gap-3 ${
                    incident.severity === 'critical'
                      ? 'bg-red-500/10 border-red-500/30'
                      : incident.severity === 'high'
                      ? 'bg-orange-500/10 border-orange-500/30'
                      : incident.severity === 'medium'
                      ? 'bg-yellow-500/10 border-yellow-500/30'
                      : 'bg-blue-500/10 border-blue-500/30'
                  }`}
                >
                  <AlertTriangle className={`w-5 h-5 flex-shrink-0 ${
                    incident.severity === 'critical' ? 'text-red-400' :
                    incident.severity === 'high' ? 'text-orange-400' :
                    incident.severity === 'medium' ? 'text-yellow-400' :
                    'text-blue-400'
                  }`} />
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">{incident.description}</span>
                      <Badge className={`text-xs uppercase ${
                        incident.severity === 'critical' ? 'bg-red-500/20 text-red-400 border-red-500/50' :
                        incident.severity === 'high' ? 'bg-orange-500/20 text-orange-400 border-orange-500/50' :
                        incident.severity === 'medium' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50' :
                        'bg-blue-500/20 text-blue-400 border-blue-500/50'
                      }`}>
                        {incident.severity}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(incident.timestamp).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Sub-Agents Status */}
        <Card className="bg-black/40 border-white/10 p-6 mt-8">
          <h2 className="text-xl font-tech font-bold mb-6">Sub-Agent Status</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-tech">Pool Orchestrator</span>
                {agentStatus.subAgents.poolOrchestrator.running ? (
                  <CheckCircle className="w-4 h-4 text-green-400" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                )}
              </div>
              <Badge className={agentStatus.subAgents.poolOrchestrator.running 
                ? "bg-green-500/20 text-green-400 border-green-500/50"
                : "bg-red-500/20 text-red-400 border-red-500/50"
              }>
                {agentStatus.subAgents.poolOrchestrator.running ? 'Active' : 'Inactive'}
              </Badge>
            </div>

            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-tech">Security Agent</span>
                {agentStatus.subAgents.securityAgent.running ? (
                  <CheckCircle className="w-4 h-4 text-green-400" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                )}
              </div>
              <Badge className={agentStatus.subAgents.securityAgent.running 
                ? "bg-green-500/20 text-green-400 border-green-500/50"
                : "bg-red-500/20 text-red-400 border-red-500/50"
              }>
                {agentStatus.subAgents.securityAgent.running ? 'Active' : 'Inactive'}
              </Badge>
            </div>

            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-tech">Analytics Agent</span>
                {agentStatus.subAgents.analyticsAgent.running ? (
                  <CheckCircle className="w-4 h-4 text-green-400" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                )}
              </div>
              <Badge className={agentStatus.subAgents.analyticsAgent.running 
                ? "bg-green-500/20 text-green-400 border-green-500/50"
                : "bg-red-500/20 text-red-400 border-red-500/50"
              }>
                {agentStatus.subAgents.analyticsAgent.running ? 'Active' : 'Inactive'}
              </Badge>
            </div>

            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-tech">Token Safety</span>
                {agentStatus.subAgents.tokenSafetyAgent.running ? (
                  <CheckCircle className="w-4 h-4 text-green-400" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                )}
              </div>
              <Badge className={agentStatus.subAgents.tokenSafetyAgent.running 
                ? "bg-green-500/20 text-green-400 border-green-500/50"
                : "bg-red-500/20 text-red-400 border-red-500/50"
              }>
                {agentStatus.subAgents.tokenSafetyAgent.running ? 'Active' : 'Inactive'}
              </Badge>
            </div>
          </div>
        </Card>

        {/* Footer */}
        <div className="mt-8 text-center text-xs text-muted-foreground">
          <p>🤖 Autonomous AI Agent System - Colosseum Hackathon</p>
          <p className="mt-1">Updates every 5 seconds • BRO-Agent ID: 234</p>
        </div>
      </div>
    </div>
  );
}
