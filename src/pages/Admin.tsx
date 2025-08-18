import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { 
  Home, 
  LogOut, 
  Play, 
  Pause, 
  SkipForward, 
  Settings, 
  Users, 
  Monitor,
  Plus,
  Minus,
  Upload
} from 'lucide-react';

interface LogEntry {
  timestamp: string;
  type: 'SONG_PLAYED' | 'USER_SELECTION' | 'CREDIT_ADDED' | 'CREDIT_REMOVED';
  description: string;
  videoId?: string;
  creditAmount?: number;
}

interface BackgroundFile {
  id: string;
  name: string;
  url: string;
  type: 'image' | 'video';
}

interface ApprovedUser {
  id: string;
  email: string;
  status: string;
  created_at: string;
}

const Admin = () => {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  // State management
  const [mode, setMode] = useState<'FREEPLAY' | 'PAID'>('FREEPLAY');
  const [credits, setCredits] = useState(0);
  const [apiKey, setApiKey] = useState('AIzaSyC12QKbzGaKZw9VD3-ulxU_mrd0htZBiI4');
  const [selectedCoinAcceptor, setSelectedCoinAcceptor] = useState('');
  const [selectedBackground, setSelectedBackground] = useState('default');
  const [cycleBackgrounds, setCycleBackgrounds] = useState(false);
  const [isPlayerRunning, setIsPlayerRunning] = useState(false);
  const [playerWindow, setPlayerWindow] = useState<Window | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [backgrounds, setBackgrounds] = useState<BackgroundFile[]>([
    { id: 'default', name: 'Default', url: '/lovable-uploads/8948bfb8-e172-4535-bd9b-76f9d1c35307.png', type: 'image' }
  ]);
  const [approvedUsers, setApprovedUsers] = useState<ApprovedUser[]>([]);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [userRole, setUserRole] = useState<string>('');
  const [loading, setLoading] = useState(true);

  // Check if user has admin permissions
  useEffect(() => {
    checkAdminAccess();
    loadApprovedUsers();
    loadUserProfile();
  }, [user]);

  const checkAdminAccess = async () => {
    if (!user) {
      navigate('/auth');
      return;
    }

    try {
      const { data: profile, error } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('user_id', user.id)
        .single();

      if (error) {
        console.error('Error fetching user profile:', error);
        toast({
          title: "Access Denied",
          description: "Unable to verify admin permissions.",
          variant: "destructive"
        });
        navigate('/');
        return;
      }

      if (!profile || (profile.role !== 'super_admin' && profile.role !== 'tenant_admin')) {
        toast({
          title: "Access Denied",
          description: "You don't have permission to access the admin console.",
          variant: "destructive"
        });
        navigate('/');
        return;
      }

      setUserRole(profile.role);
    } catch (error) {
      console.error('Error checking admin access:', error);
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  const loadUserProfile = async () => {
    if (!user) return;

    try {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('user_id', user.id)
        .single();

      if (profile) {
        setUserRole(profile.role);
      }
    } catch (error) {
      console.error('Error loading user profile:', error);
    }
  };

  const loadApprovedUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('approved_users')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading approved users:', error);
        return;
      }

      setApprovedUsers(data || []);
    } catch (error) {
      console.error('Error loading approved users:', error);
    }
  };

  const addApprovedUser = async () => {
    if (!newUserEmail.trim()) return;

    try {
      const { error } = await supabase
        .from('approved_users')
        .insert({
          email: newUserEmail.toLowerCase(),
          status: 'approved',
          approved_by: user?.id,
          approved_at: new Date().toISOString()
        });

      if (error) {
        toast({
          title: "Error",
          description: "Failed to add user. Email might already exist.",
          variant: "destructive"
        });
        return;
      }

      toast({
        title: "User Added",
        description: `${newUserEmail} has been approved for access.`,
      });

      setNewUserEmail('');
      loadApprovedUsers();
    } catch (error) {
      console.error('Error adding approved user:', error);
    }
  };

  const updateUserStatus = async (userId: string, status: 'approved' | 'rejected') => {
    try {
      const { error } = await supabase
        .from('approved_users')
        .update({
          status,
          approved_by: user?.id,
          approved_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (error) {
        toast({
          title: "Error",
          description: "Failed to update user status.",
          variant: "destructive"
        });
        return;
      }

      toast({
        title: "Status Updated",
        description: `User has been ${status}.`,
      });

      loadApprovedUsers();
    } catch (error) {
      console.error('Error updating user status:', error);
    }
  };

  const addLog = (type: LogEntry['type'], description: string, videoId?: string, creditAmount?: number) => {
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      type,
      description,
      videoId,
      creditAmount
    };
    setLogs(prev => [logEntry, ...prev]);
  };

  const handlePlayerToggle = () => {
    if (isPlayerRunning) {
      // Stop player
      if (playerWindow && !playerWindow.closed) {
        const command = { action: 'stop' };
        try {
          playerWindow.localStorage.setItem('jukeboxCommand', JSON.stringify(command));
          addLog('SONG_PLAYED', 'Player stopped by admin');
        } catch (error) {
          console.error('Error sending stop command:', error);
        }
      }
      setIsPlayerRunning(false);
    } else {
      // Start player
      const newPlayerWindow = window.open('/player.html', 'JukeboxPlayer', 
        'width=800,height=600,scrollbars=no,menubar=no,toolbar=no,location=no,status=no');
      
      if (newPlayerWindow) {
        setPlayerWindow(newPlayerWindow);
        setIsPlayerRunning(true);
        addLog('SONG_PLAYED', 'Player started by admin');
      }
    }
  };

  const handleSkipSong = () => {
    if (playerWindow && !playerWindow.closed) {
      const command = { action: 'fadeOutAndBlack' };
      try {
        playerWindow.localStorage.setItem('jukeboxCommand', JSON.stringify(command));
        addLog('SONG_PLAYED', 'Song skipped by admin');
      } catch (error) {
        console.error('Error sending skip command:', error);
      }
    }
  };

  const handleBackgroundUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    const type = file.type.startsWith('video/') ? 'video' : 'image';
    
    const newBackground: BackgroundFile = {
      id: Date.now().toString(),
      name: file.name,
      url,
      type
    };

    setBackgrounds(prev => [...prev, newBackground]);

    toast({
      title: "Background Added",
      description: `${file.name} has been added to backgrounds`,
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Loading admin console...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Settings className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Admin Console</h1>
              <p className="text-sm text-muted-foreground">DJAMMS Jukebox Management</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              {user?.email} ({userRole === 'super_admin' ? 'Super Admin' : 'Admin'})
            </span>
            <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
              <Home className="h-4 w-4 mr-2" />
              Home
            </Button>
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="p-6">
        <Tabs defaultValue="control" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="control">Player Control</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
            <TabsTrigger value="users">User Management</TabsTrigger>
            <TabsTrigger value="monitor">Monitor</TabsTrigger>
          </TabsList>

          <TabsContent value="control" className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Monitor className="h-5 w-5" />
                    Player Controls
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Button 
                      onClick={handlePlayerToggle}
                      variant={isPlayerRunning ? "destructive" : "default"}
                    >
                      {isPlayerRunning ? (
                        <>
                          <Pause className="h-4 w-4 mr-2" />
                          Stop Player
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4 mr-2" />
                          Start Player
                        </>
                      )}
                    </Button>
                    <Button 
                      onClick={handleSkipSong}
                      variant="outline"
                      disabled={!isPlayerRunning}
                    >
                      <SkipForward className="h-4 w-4 mr-2" />
                      Skip Song
                    </Button>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Player Status: {isPlayerRunning ? 'Running' : 'Stopped'}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Credit Management</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span>Current Credits: {credits}</span>
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => {
                          setCredits(prev => Math.max(0, prev - 1));
                          addLog('CREDIT_REMOVED', 'Admin removed credit', undefined, -1);
                        }}
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <Button 
                        size="sm"
                        onClick={() => {
                          setCredits(prev => prev + 1);
                          addLog('CREDIT_ADDED', 'Admin added credit', undefined, 1);
                        }}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Play Mode</Label>
                    <Select value={mode} onValueChange={(value: 'FREEPLAY' | 'PAID') => setMode(value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="FREEPLAY">Free Play</SelectItem>
                        <SelectItem value="PAID">Paid Mode</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>API Configuration</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="apiKey">YouTube API Key</Label>
                    <Input
                      id="apiKey"
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="Enter YouTube API key"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Coin Acceptor</Label>
                    <Select value={selectedCoinAcceptor} onValueChange={setSelectedCoinAcceptor}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select coin acceptor" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">None</SelectItem>
                        <SelectItem value="acceptor1">Acceptor 1</SelectItem>
                        <SelectItem value="acceptor2">Acceptor 2</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Background Settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Background</Label>
                    <Select value={selectedBackground} onValueChange={setSelectedBackground}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {backgrounds.map((bg) => (
                          <SelectItem key={bg.id} value={bg.id}>
                            {bg.name}
                          </SelectItem>
                        ))}
                        <SelectItem value="upload">Upload New...</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="cycleBackgrounds" 
                      checked={cycleBackgrounds}
                      onCheckedChange={(checked) => setCycleBackgrounds(checked as boolean)}
                    />
                    <Label htmlFor="cycleBackgrounds">Cycle backgrounds</Label>
                  </div>
                  <div>
                    <input
                      type="file"
                      accept="image/*,video/*"
                      onChange={handleBackgroundUpload}
                      className="hidden"
                      id="background-upload"
                    />
                    <Button 
                      variant="outline" 
                      onClick={() => document.getElementById('background-upload')?.click()}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Upload Background
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="users" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  User Management
                </CardTitle>
                <CardDescription>
                  Manage approved users and access control
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter email address"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                  />
                  <Button onClick={addApprovedUser}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add User
                  </Button>
                </div>
                
                <Separator />
                
                <ScrollArea className="h-64">
                  <div className="space-y-2">
                    {approvedUsers.map((user) => (
                      <div key={user.id} className="flex items-center justify-between p-2 border rounded">
                        <div>
                          <p className="font-medium">{user.email}</p>
                          <p className="text-sm text-muted-foreground">
                            Status: {user.status} • Added: {new Date(user.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateUserStatus(user.id, 'approved')}
                            disabled={user.status === 'approved'}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => updateUserStatus(user.id, 'rejected')}
                            disabled={user.status === 'rejected'}
                          >
                            Reject
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="monitor" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Activity Log</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-64">
                  <div className="space-y-2">
                    {logs.map((log, index) => (
                      <div key={index} className="text-sm p-2 border-l-2 border-primary/20">
                        <p className="font-medium">{log.description}</p>
                        <p className="text-muted-foreground">
                          {new Date(log.timestamp).toLocaleString()} • {log.type}
                          {log.creditAmount && ` • Credits: ${log.creditAmount > 0 ? '+' : ''}${log.creditAmount}`}
                        </p>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Admin;