import React, { useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Check, X, Home, LogOut } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { SearchInterface } from "@/components/SearchInterface";
import { useBackgroundManager, BackgroundDisplay } from "@/components/BackgroundManager";

interface SearchResult {
  id: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  videoUrl: string;
  officialScore?: number;
}

interface PlaylistItem {
  id: string;
  title: string;
  channelTitle: string;
  videoId: string;
}

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

interface JukeboxState {
  mode: 'FREEPLAY' | 'PAID';
  credits: number;
  currentPlaylist: string[];
  defaultPlaylist: string;
  defaultPlaylistVideos: PlaylistItem[];
  currentVideoIndex: number;
  isSearchOpen: boolean;
  searchResults: SearchResult[];
  searchQuery: string;
  isSearching: boolean;
  playerWindow: Window | null;
  apiKey: string;
  logs: LogEntry[];
  backgrounds: BackgroundFile[];
  selectedBackground: string;
  cycleBackgrounds: boolean;
  backgroundCycleIndex: number;
  showKeyboard: boolean;
  showSearchResults: boolean;
  isPlayerRunning: boolean;
}

const DEFAULT_API_KEY = 'AIzaSyC12QKbzGaKZw9VD3-ulxU_mrd0htZBiI4';
const DEFAULT_PLAYLIST_ID = 'PLN9QqCogPsXJCgeL_iEgYnW6Rl_8nIUUH';

const Jukebox = () => {
  const { toast } = useToast();
  const navigate = useNavigate();

  const [state, setState] = useState<JukeboxState>({
    mode: 'FREEPLAY',
    credits: 0,
    currentPlaylist: [],
    defaultPlaylist: DEFAULT_PLAYLIST_ID,
    defaultPlaylistVideos: [],
    currentVideoIndex: 0,
    isSearchOpen: false,
    searchResults: [],
    searchQuery: '',
    isSearching: false,
    playerWindow: null,
    apiKey: DEFAULT_API_KEY,
    logs: [],
    backgrounds: [{ id: 'default', name: 'Default', url: '/lovable-uploads/8948bfb8-e172-4535-bd9b-76f9d1c35307.png', type: 'image' }],
    selectedBackground: 'default',
    cycleBackgrounds: false,
    backgroundCycleIndex: 0,
    showKeyboard: false,
    showSearchResults: false,
    isPlayerRunning: false
  });

  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    video: SearchResult | null;
  }>({ isOpen: false, video: null });

  // Use background manager hook
  const { getCurrentBackground } = useBackgroundManager({
    backgrounds: state.backgrounds,
    selectedBackground: state.selectedBackground,
    cycleBackgrounds: state.cycleBackgrounds,
    backgroundCycleIndex: state.backgroundCycleIndex,
    onBackgroundCycleIndexChange: (index) => setState(prev => ({ ...prev, backgroundCycleIndex: index })),
    onSelectedBackgroundChange: (id) => setState(prev => ({ ...prev, selectedBackground: id }))
  });

  const addLog = useCallback((type: LogEntry['type'], description: string, videoId?: string, creditAmount?: number) => {
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      type,
      description,
      videoId,
      creditAmount
    };
    setState(prev => ({ ...prev, logs: [logEntry, ...prev.logs] }));
  }, []);

  // Initialize player window and load default playlist
  useEffect(() => {
    const playerWindow = window.open('/player.html', 'JukeboxPlayer', 
      'width=800,height=600,scrollbars=no,menubar=no,toolbar=no,location=no,status=no');
    
    if (playerWindow) {
      setState(prev => ({ ...prev, playerWindow, isPlayerRunning: true }));
      console.log('Player window opened successfully');
      loadPlaylistVideos(DEFAULT_PLAYLIST_ID);
    } else {
      toast({
        title: "Error",
        description: "Failed to open player window. Please allow popups.",
        variant: "destructive"
      });
    }

    return () => {
      if (state.playerWindow && !state.playerWindow.closed) {
        state.playerWindow.close();
      }
    };
  }, []);

  const loadPlaylistVideos = async (playlistId: string) => {
    try {
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${playlistId}&maxResults=50&key=${state.apiKey}`
      );
      
      if (!response.ok) throw new Error('Failed to load playlist');
      
      const data = await response.json();
      const videos: PlaylistItem[] = data.items.map((item: any) => ({
        id: item.id,
        title: item.snippet.title,
        channelTitle: item.snippet.channelTitle,
        videoId: item.snippet.resourceId.videoId
      }));

      setState(prev => ({ ...prev, defaultPlaylistVideos: videos }));
    } catch (error) {
      console.error('Error loading playlist:', error);
      toast({
        title: "Playlist Error",
        description: "Failed to load default playlist",
        variant: "destructive"
      });
    }
  };

  const performSearch = async (query: string) => {
    if (!query.trim()) return;

    setState(prev => ({ ...prev, isSearching: true, showSearchResults: false }));

    try {
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=20&key=${state.apiKey}`
      );

      if (!response.ok) {
        throw new Error('Search failed');
      }

      const data = await response.json();
      
      if (!data.items) {
        throw new Error('No results found');
      }

      const results: SearchResult[] = data.items.map((item: any) => ({
        id: item.id.videoId,
        title: item.snippet.title,
        channelTitle: item.snippet.channelTitle,
        thumbnailUrl: item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url,
        videoUrl: `https://www.youtube.com/watch?v=${item.id.videoId}`,
        officialScore: calculateOfficialScore(item.snippet.title, item.snippet.channelTitle)
      }));

      // Sort by official score (higher is better)
      results.sort((a, b) => (b.officialScore || 0) - (a.officialScore || 0));

      setState(prev => ({ 
        ...prev, 
        searchResults: results, 
        showSearchResults: true,
        isSearching: false 
      }));

    } catch (error) {
      console.error('Search error:', error);
      toast({
        title: "Search Error",
        description: "Failed to search for videos. Please try again.",
        variant: "destructive"
      });
      setState(prev => ({ ...prev, isSearching: false }));
    }
  };

  const calculateOfficialScore = (title: string, channelTitle: string): number => {
    let score = 0;
    const titleLower = title.toLowerCase();
    const channelLower = channelTitle.toLowerCase();

    // Official music channels get higher scores
    const officialChannelKeywords = ['vevo', 'records', 'music', 'official'];
    if (officialChannelKeywords.some(keyword => channelLower.includes(keyword))) {
      score += 10;
    }

    // Official video indicators
    const officialTitleKeywords = ['official', 'music video', 'official video'];
    if (officialTitleKeywords.some(keyword => titleLower.includes(keyword))) {
      score += 5;
    }

    // Penalize covers, remixes, etc.
    const unofficialKeywords = ['cover', 'remix', 'karaoke', 'instrumental', 'live'];
    if (unofficialKeywords.some(keyword => titleLower.includes(keyword))) {
      score -= 3;
    }

    return score;
  };

  const confirmAddToPlaylist = () => {
    if (!confirmDialog.video) return;

    const video = confirmDialog.video;

    // Check if we need credits and have them
    if (state.mode === 'PAID' && state.credits <= 0) {
      toast({
        title: "Insufficient Credits",
        description: "You need credits to add songs to the playlist.",
        variant: "destructive"
      });
      setConfirmDialog({ isOpen: false, video: null });
      return;
    }

    // Add to playlist
    setState(prev => ({
      ...prev,
      currentPlaylist: [...prev.currentPlaylist, video.id],
      credits: prev.mode === 'PAID' ? prev.credits - 1 : prev.credits
    }));

    // Send to player
    if (state.playerWindow && !state.playerWindow.closed) {
      const command = {
        action: 'addToPlaylist',
        videoId: video.id,
        title: video.title,
        channelTitle: video.channelTitle
      };

      try {
        state.playerWindow.localStorage.setItem('jukeboxCommand', JSON.stringify(command));
        addLog('USER_SELECTION', `Added "${video.title}" by ${video.channelTitle}`, video.id);
        
        toast({
          title: "Song Added",
          description: `"${video.title}" has been added to the playlist`,
        });
      } catch (error) {
        console.error('Error sending command to player:', error);
        toast({
          title: "Player Error",
          description: "Failed to communicate with player window",
          variant: "destructive"
        });
      }
    }

    setConfirmDialog({ isOpen: false, video: null });
  };

  return (
    <BackgroundDisplay background={getCurrentBackground()}>
      <div className="relative z-10 min-h-screen">
        {/* Header */}
        <header className="p-4 bg-black/20 backdrop-blur border-b border-white/10">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-white">Music Jukebox</h1>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
                <Home className="h-4 w-4 mr-2" />
                Home
              </Button>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <div className="flex flex-col items-center justify-center min-h-[calc(100vh-80px)] p-8">
          <Card className="w-full max-w-md bg-white/10 backdrop-blur border-white/20">
            <CardContent className="p-8 text-center">
              <h2 className="text-3xl font-bold mb-6 text-white">Select Your Music</h2>
              
              {state.mode === 'PAID' && (
                <div className="mb-6 p-4 bg-black/20 rounded-lg border border-white/20">
                  <p className="text-white/80">Credits Available</p>
                  <p className="text-3xl font-bold text-white">{state.credits}</p>
                </div>
              )}

              <Button 
                size="lg" 
                className="w-full mb-4 bg-primary hover:bg-primary/90"
                onClick={() => setState(prev => ({ ...prev, isSearchOpen: true, showKeyboard: true }))}
              >
                Search for Music
              </Button>

              <div className="text-white/70 text-sm">
                {state.currentPlaylist.length > 0 && (
                  <p>{state.currentPlaylist.length} song(s) in queue</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search Interface */}
        <SearchInterface
          isOpen={state.isSearchOpen}
          onClose={() => setState(prev => ({ 
            ...prev, 
            isSearchOpen: false, 
            showKeyboard: false, 
            showSearchResults: false,
            searchQuery: '',
            searchResults: []
          }))}
          searchQuery={state.searchQuery}
          searchResults={state.searchResults}
          isSearching={state.isSearching}
          showKeyboard={state.showKeyboard}
          showSearchResults={state.showSearchResults}
          onVideoSelect={(video) => setConfirmDialog({ isOpen: true, video })}
          onSearchQueryChange={(query) => setState(prev => ({ ...prev, searchQuery: query }))}
          onBackToSearch={() => setState(prev => ({ ...prev, showSearchResults: false, showKeyboard: true }))}
          onKeyboardInput={(key) => {
            // Handle keyboard input logic
            setState(prev => {
              let newQuery = prev.searchQuery;
              
              switch (key) {
                case 'BACKSPACE':
                  newQuery = newQuery.slice(0, -1);
                  return { ...prev, searchQuery: newQuery };
                case 'SPACE':
                  newQuery += ' ';
                  return { ...prev, searchQuery: newQuery };
                case 'SEARCH':
                  if (newQuery.trim()) {
                    performSearch(newQuery);
                  }
                  return prev;
                default:
                  newQuery += key;
                  return { ...prev, searchQuery: newQuery };
              }
            });
          }}
        />

        {/* Confirmation Dialog */}
        <Dialog open={confirmDialog.isOpen} onOpenChange={(open) => 
          setConfirmDialog({ isOpen: open, video: null })
        }>
          <DialogContent className="bg-card">
            <DialogHeader>
              <DialogTitle>Add to Playlist?</DialogTitle>
            </DialogHeader>
            {confirmDialog.video && (
              <div className="py-4">
                <p className="font-medium">{confirmDialog.video.title}</p>
                <p className="text-sm text-muted-foreground">{confirmDialog.video.channelTitle}</p>
                {state.mode === 'PAID' && (
                  <p className="text-sm mt-2">This will use 1 credit.</p>
                )}
              </div>
            )}
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => setConfirmDialog({ isOpen: false, video: null })}
              >
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
              <Button onClick={confirmAddToPlaylist}>
                <Check className="h-4 w-4 mr-2" />
                Add Song
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </BackgroundDisplay>
  );
};

export default Jukebox;
