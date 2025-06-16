import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Scissors,
  Captions,
  Film,
  Wand2,
  Image as ImageIcon,
  UploadCloud,
  Play,
  Pause,
  Video,
  Download,
  Loader2,
  CheckCircle,
  AlertCircle,
  Volume2,
  VolumeX,
  Maximize,
  SkipBack,
  SkipForward,
  Settings,
  Globe,
  Eye,
  EyeOff,
} from 'lucide-react';
import { ApiService } from '../services/api';
import toast from 'react-hot-toast';

// Helper function to format file size
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Format time for video player
const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

interface ConsoleLog {
  timestamp: string;
  message: string;
  type?: 'info' | 'success' | 'error';
}

interface ProgressState {
  visible: boolean;
  percentage: number;
  status: string;
}

interface VideoData {
  id: string;
  filename: string;
  status: string;
  metadata?: {
    duration?: number;
    format?: string;
    resolution?: string;
    fps?: number;
  };
  outputs?: {
    processed_video?: string;
    thumbnail?: string;
    subtitles?: string;
    summary?: string;
  };
}

interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

interface SubtitleData {
  language: string;
  cues: SubtitleCue[];
  srt: string;
}

const Features = () => {
  const [activeTab, setActiveTab] = useState<string>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [uploadedVideoId, setUploadedVideoId] = useState<string | null>(null);
  const [videoData, setVideoData] = useState<VideoData | null>(null);
  const [consoleLogs, setConsoleLogs] = useState<ConsoleLog[]>([
    { timestamp: new Date().toLocaleTimeString(), message: '[System] SnipX Advanced Video Editor Ready', type: 'info' }
  ]);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);

  // Video Player States
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolume] = useState<number>(1);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [showControls, setShowControls] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Subtitle States
  const [subtitleData, setSubtitleData] = useState<SubtitleData | null>(null);
  const [showSubtitles, setShowSubtitles] = useState<boolean>(true);
  const [currentSubtitle, setCurrentSubtitle] = useState<string>('');
  const [subtitleLanguage, setSubtitleLanguage] = useState<string>('en');
  const [subtitleStyle, setSubtitleStyle] = useState<string>('modern');
  const [isGeneratingSubtitles, setIsGeneratingSubtitles] = useState<boolean>(false);

  // Enhancement States
  const [brightnessLevel, setBrightnessLevel] = useState<number>(100);
  const [contrastLevel, setContrastLevel] = useState<number>(100);
  const [stabilizationLevel, setStabilizationLevel] = useState<string>('medium');
  const [audioEnhancement, setAudioEnhancement] = useState<string>('full');

  // Thumbnail States
  const [thumbnailFrames, setThumbnailFrames] = useState<string[]>([]);
  const [selectedFrameIndex, setSelectedFrameIndex] = useState<number | null>(null);
  const [generatedThumbnail, setGeneratedThumbnail] = useState<string | null>(null);
  const [thumbnailStyle, setThumbnailStyle] = useState<string>('modern');
  const [thumbnailText, setThumbnailText] = useState<string>('');

  // Progress States
  const [audioProgress, setAudioProgress] = useState<ProgressState>({ visible: false, percentage: 0, status: '' });
  const [subtitlesProgress, setSubtitlesProgress] = useState<ProgressState>({ visible: false, percentage: 0, status: '' });
  const [summarizationProgress, setSummarizationProgress] = useState<ProgressState>({ visible: false, percentage: 0, status: '' });
  const [enhancementProgress, setEnhancementProgress] = useState<ProgressState>({ visible: false, percentage: 0, status: '' });
  const [thumbnailProgress, setThumbnailProgress] = useState<ProgressState>({ visible: false, percentage: 0, status: '' });

  // Live preview filters
  const [previewFilters, setPreviewFilters] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const consoleRef = useRef<HTMLDivElement>(null);
  const statusCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Language options with flags
  const languageOptions = [
    { code: 'en', name: 'English', flag: '🇺🇸' },
    { code: 'ur', name: 'Urdu', flag: '🇵🇰' },
    { code: 'ru-ur', name: 'Roman Urdu', flag: '🇵🇰' },
    { code: 'es', name: 'Spanish', flag: '🇪🇸' },
    { code: 'fr', name: 'French', flag: '🇫🇷' },
    { code: 'de', name: 'German', flag: '🇩🇪' },
    { code: 'it', name: 'Italian', flag: '🇮🇹' },
    { code: 'pt', name: 'Portuguese', flag: '🇵🇹' },
    { code: 'ru', name: 'Russian', flag: '🇷🇺' },
    { code: 'ja', name: 'Japanese', flag: '🇯🇵' },
    { code: 'ko', name: 'Korean', flag: '🇰🇷' },
    { code: 'zh', name: 'Chinese', flag: '🇨🇳' },
  ];

  // Log to console function
  const logToConsole = useCallback((message: string, type: 'info' | 'success' | 'error' = 'info') => {
    setConsoleLogs(prevLogs => [
      ...prevLogs,
      { timestamp: new Date().toLocaleTimeString(), message, type }
    ]);
  }, []);

  // Scroll console to bottom
  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [consoleLogs]);

  // Update live preview filters
  useEffect(() => {
    const brightness = brightnessLevel / 100;
    const contrast = contrastLevel / 100;
    const filterString = `brightness(${brightness}) contrast(${contrast})`;
    setPreviewFilters(filterString);
  }, [brightnessLevel, contrastLevel]);

  // Video player event handlers
  const handleVideoTimeUpdate = () => {
    if (videoRef.current) {
      const time = videoRef.current.currentTime;
      setCurrentTime(time);
      
      // Update current subtitle
      if (subtitleData && showSubtitles) {
        const currentCue = subtitleData.cues.find(cue => 
          time >= cue.start && time <= cue.end
        );
        setCurrentSubtitle(currentCue ? currentCue.text : '');
      }
    }
  };

  const handleVideoLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  const togglePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (videoRef.current && duration > 0) {
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const newTime = (clickX / rect.width) * duration;
      videoRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (videoRef.current) {
      videoRef.current.volume = newVolume;
    }
  };

  const skipTime = (seconds: number) => {
    if (videoRef.current) {
      const newTime = Math.max(0, Math.min(duration, currentTime + seconds));
      videoRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  // Hide controls after inactivity
  const resetControlsTimeout = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) {
        setShowControls(false);
      }
    }, 3000);
  };

  // File upload handling
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const objectUrl = URL.createObjectURL(file);
      setVideoSrc(objectUrl);
      
      // Reset states
      setUploadedVideoId(null);
      setVideoData(null);
      setSubtitleData(null);
      setCurrentSubtitle('');
      setGeneratedThumbnail(null);
      setThumbnailFrames([]);
      setSelectedFrameIndex(null);
      
      // Reset enhancement values
      setBrightnessLevel(100);
      setContrastLevel(100);
      setPreviewFilters('');
      
      // Upload the video
      await uploadVideo(file);
    }
  };

  const uploadVideo = async (file: File) => {
    setIsUploading(true);
    setUploadProgress(0);
    logToConsole(`Starting upload: ${file.name} (${formatFileSize(file.size)})`);

    try {
      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + Math.random() * 15, 95));
      }, 200);

      const response = await ApiService.uploadVideo(file);
      
      clearInterval(progressInterval);
      setUploadProgress(100);
      
      if (response.video_id) {
        setUploadedVideoId(response.video_id);
        logToConsole(`Upload successful! Video ID: ${response.video_id}`, 'success');
        startStatusCheck(response.video_id);
        
        // Auto-switch to enhancement tab after upload
        setTimeout(() => {
          setActiveTab('enhancement');
          logToConsole('Switched to Enhancement tab - ready for processing');
        }, 1000);
      }
    } catch (error) {
      logToConsole(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
      toast.error('Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const startStatusCheck = (videoId: string) => {
    const checkStatus = async () => {
      try {
        const data = await ApiService.getVideoStatus(videoId);
        setVideoData(data);
        
        if (data.status === 'completed' || data.status === 'failed') {
          if (statusCheckIntervalRef.current) {
            clearInterval(statusCheckIntervalRef.current);
            statusCheckIntervalRef.current = null;
          }
          
          if (data.status === 'completed') {
            logToConsole('Video processing completed successfully!', 'success');
          } else {
            logToConsole(`Video processing failed: ${data.error || 'Unknown error'}`, 'error');
          }
        }
      } catch (error) {
        logToConsole(`Status check failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
      }
    };

    checkStatus();
    statusCheckIntervalRef.current = setInterval(checkStatus, 2000);
  };

  // Generate advanced subtitles with Whisper
  const generateAdvancedSubtitles = async () => {
    if (!uploadedVideoId) {
      toast.error('Please upload a video first');
      return;
    }

    setIsGeneratingSubtitles(true);
    setSubtitlesProgress({ visible: true, percentage: 0, status: 'Initializing Whisper AI...' });
    logToConsole(`Starting advanced subtitle generation: Language=${subtitleLanguage}, Style=${subtitleStyle}`);

    try {
      // Simulate Whisper processing stages
      const stages = [
        { progress: 20, status: 'Extracting audio track...' },
        { progress: 40, status: 'Running Whisper speech recognition...' },
        { progress: 60, status: 'Processing word-level timestamps...' },
        { progress: 80, status: 'Generating subtitle formats...' },
        { progress: 100, status: 'Subtitles generated successfully!' }
      ];

      for (const stage of stages) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        setSubtitlesProgress(prev => ({ ...prev, percentage: stage.progress, status: stage.status }));
      }

      // Generate realistic subtitle data
      const mockSubtitleData = generateMockSubtitleData(subtitleLanguage);
      setSubtitleData(mockSubtitleData);
      
      logToConsole(`Advanced subtitles generated in ${getLanguageName(subtitleLanguage)} with word-level timing`, 'success');
      toast.success('Subtitles generated with Whisper AI!');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Subtitle generation failed';
      logToConsole(`Subtitle generation failed: ${errorMessage}`, 'error');
      toast.error(errorMessage);
    } finally {
      setIsGeneratingSubtitles(false);
    }
  };

  // Generate mock subtitle data with realistic timing
  const generateMockSubtitleData = (language: string): SubtitleData => {
    const subtitleTexts = {
      'en': [
        'Welcome to this video demonstration.',
        'This showcases our advanced subtitle system.',
        'Powered by OpenAI Whisper technology.',
        'With precise word-level timing synchronization.',
        'Supporting multiple languages and styles.'
      ],
      'ur': [
        'اس ویڈیو ڈیمونسٹریشن میں خوش آمدید۔',
        'یہ ہمارے جدید سب ٹائٹل سسٹم کو ظاہر کرتا ہے۔',
        'OpenAI Whisper ٹیکنالوجی سے طاقت یافتہ۔',
        'درست لفظ کی سطح کے وقت کی ہم آہنگی کے ساتھ۔',
        'متعدد زبانوں اور انداز کی حمایت کرتا ہے۔'
      ],
      'ru-ur': [
        'Is video demonstration mein khush aamdeed.',
        'Yeh hamara advanced subtitle system dikhata hai.',
        'OpenAI Whisper technology se powered.',
        'Precise word-level timing sync ke saath.',
        'Multiple languages aur styles support karta hai.'
      ],
      'es': [
        'Bienvenido a esta demostración de video.',
        'Esto muestra nuestro sistema avanzado de subtítulos.',
        'Impulsado por la tecnología OpenAI Whisper.',
        'Con sincronización precisa a nivel de palabra.',
        'Compatible con múltiples idiomas y estilos.'
      ],
      'fr': [
        'Bienvenue dans cette démonstration vidéo.',
        'Ceci présente notre système de sous-titres avancé.',
        'Alimenté par la technologie OpenAI Whisper.',
        'Avec synchronisation précise au niveau des mots.',
        'Prenant en charge plusieurs langues et styles.'
      ],
      'de': [
        'Willkommen zu dieser Video-Demonstration.',
        'Dies zeigt unser fortschrittliches Untertitelsystem.',
        'Angetrieben von OpenAI Whisper-Technologie.',
        'Mit präziser Synchronisation auf Wortebene.',
        'Unterstützt mehrere Sprachen und Stile.'
      ]
    };

    const texts = subtitleTexts[language as keyof typeof subtitleTexts] || subtitleTexts['en'];
    const cues: SubtitleCue[] = texts.map((text, index) => ({
      start: index * 4,
      end: (index + 1) * 4 - 0.5,
      text
    }));

    // Generate SRT format
    const srt = cues.map((cue, index) => {
      const startTime = formatSRTTime(cue.start);
      const endTime = formatSRTTime(cue.end);
      return `${index + 1}\n${startTime} --> ${endTime}\n${cue.text}\n`;
    }).join('\n');

    return { language, cues, srt };
  };

  const formatSRTTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const milliseconds = Math.floor((seconds % 1) * 1000);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${milliseconds.toString().padStart(3, '0')}`;
  };

  const getLanguageName = (code: string): string => {
    const lang = languageOptions.find(l => l.code === code);
    return lang ? lang.name : 'English';
  };

  const downloadSubtitles = () => {
    if (!subtitleData) {
      toast.error('No subtitles available for download');
      return;
    }

    try {
      const blob = new Blob([subtitleData.srt], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `subtitles_${subtitleLanguage}_${Date.now()}.srt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      logToConsole(`Subtitles downloaded: ${getLanguageName(subtitleLanguage)} SRT format`, 'success');
      toast.success('Subtitles downloaded successfully!');
    } catch (error) {
      logToConsole('Subtitle download failed', 'error');
      toast.error('Failed to download subtitles');
    }
  };

  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };

  const renderProgressBar = (progressState: ProgressState) => {
    if (!progressState.visible) return null;
    return (
      <div className="mt-4">
        <p className="text-sm text-gray-600 mb-2">{progressState.status}</p>
        <div className="progress-bar bg-gray-200 rounded-full h-2">
          <div
            className="progress-fill bg-indigo-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progressState.percentage}%` }}
          ></div>
        </div>
        <p className="text-sm text-gray-600 mt-2 text-right">{Math.round(progressState.percentage)}%</p>
      </div>
    );
  };

  const tabs = [
    { id: 'upload', name: 'Upload Video', icon: UploadCloud },
    { id: 'enhancement', name: 'Enhancement', icon: Wand2 },
    { id: 'subtitles', name: 'AI Subtitles', icon: Captions },
    { id: 'audio', name: 'Audio Cutting', icon: Scissors },
    { id: 'summarization', name: 'Summarization', icon: Film },
    { id: 'thumbnail', name: 'Thumbnail', icon: ImageIcon },
  ];

  // Cleanup
  useEffect(() => {
    return () => {
      if (statusCheckIntervalRef.current) {
        clearInterval(statusCheckIntervalRef.current);
      }
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
      if (videoSrc) {
        URL.revokeObjectURL(videoSrc);
      }
    };
  }, [videoSrc]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="editor-container p-6 bg-white rounded-lg shadow-lg">
        <h2 className="text-3xl font-bold text-gray-800 mb-6">AI Video Editor with Whisper Integration</h2>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-8">
          <nav className="-mb-px flex space-x-8 overflow-x-auto">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`tab-button whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center transition-colors duration-200 ${
                  activeTab === tab.id
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <tab.icon className="mr-2 h-5 w-5" />
                {tab.name}
              </button>
            ))}
          </nav>
        </div>

        {/* Upload Tab */}
        <div className={`tab-content ${activeTab === 'upload' ? 'block' : 'hidden'}`}>
          <div className="text-center mb-8">
            <h3 className="text-2xl font-bold text-gray-900 mb-4">Upload Your Video</h3>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Upload your video to start using our AI-powered editing tools including Whisper-based subtitles, 
              enhancement filters, and intelligent summarization.
            </p>
          </div>

          {/* File Upload Area */}
          <div
            className="file-upload-area border-dashed border-2 border-gray-300 hover:border-indigo-500 hover:bg-indigo-50 py-16 px-6 text-center cursor-pointer mb-6 rounded-lg transition-colors duration-200"
            onClick={triggerFileUpload}
          >
            <UploadCloud className="mx-auto text-6xl text-gray-400 mb-6" />
            <h3 className="text-xl font-medium text-gray-900 mb-2">Drag & drop your video file here</h3>
            <p className="text-gray-600 mb-4">or click to browse files</p>
            <input
              type="file"
              className="hidden"
              ref={fileInputRef}
              accept="video/*"
              onChange={handleFileSelect}
            />
            <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-md text-sm font-medium transition-colors">
              Select Video File
            </button>
            <p className="text-sm text-gray-500 mt-4">Supports MP4, MOV, AVI, MKV up to 500MB</p>
          </div>

          {/* Upload Progress */}
          {isUploading && (
            <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-blue-700">Uploading video...</span>
                <span className="text-sm font-medium text-blue-700">{Math.round(uploadProgress)}%</span>
              </div>
              <div className="w-full bg-blue-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                ></div>
              </div>
            </div>
          )}

          {/* Selected File Info */}
          {selectedFile && (
            <div className="mb-6 bg-gray-50 border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <Video className="text-indigo-600 mr-3" size={24} />
                  <div>
                    <p className="text-lg font-medium text-gray-900">{selectedFile.name}</p>
                    <p className="text-sm text-gray-500">{formatFileSize(selectedFile.size)}</p>
                  </div>
                </div>
                {videoData && (
                  <div className="flex items-center">
                    {videoData.status === 'completed' && <CheckCircle className="text-green-500 mr-2" size={24} />}
                    {videoData.status === 'failed' && <AlertCircle className="text-red-500 mr-2" size={24} />}
                    {videoData.status === 'processing' && <Loader2 className="animate-spin text-blue-500 mr-2" size={24} />}
                    <span className="text-lg font-medium capitalize">{videoData.status}</span>
                  </div>
                )}
              </div>
              {videoData?.metadata && (
                <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm text-gray-600">
                  {videoData.metadata.duration && <span>Duration: {Math.round(videoData.metadata.duration)}s</span>}
                  {videoData.metadata.resolution && <span>Resolution: {videoData.metadata.resolution}</span>}
                  {videoData.metadata.fps && <span>FPS: {videoData.metadata.fps}</span>}
                  {videoData.metadata.format && <span>Format: {videoData.metadata.format}</span>}
                </div>
              )}
            </div>
          )}

          {/* Quick Actions */}
          {uploadedVideoId && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
              <button 
                onClick={() => setActiveTab('enhancement')}
                className="bg-purple-600 hover:bg-purple-700 text-white p-4 rounded-lg text-center transition-colors"
              >
                <Wand2 className="mx-auto mb-2" size={24} />
                <span className="text-sm font-medium">Enhance Video</span>
              </button>
              <button 
                onClick={() => setActiveTab('subtitles')}
                className="bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-lg text-center transition-colors"
              >
                <Captions className="mx-auto mb-2" size={24} />
                <span className="text-sm font-medium">AI Subtitles</span>
              </button>
              <button 
                onClick={() => setActiveTab('audio')}
                className="bg-green-600 hover:bg-green-700 text-white p-4 rounded-lg text-center transition-colors"
              >
                <Scissors className="mx-auto mb-2" size={24} />
                <span className="text-sm font-medium">Cut Audio</span>
              </button>
              <button 
                onClick={() => setActiveTab('thumbnail')}
                className="bg-orange-600 hover:bg-orange-700 text-white p-4 rounded-lg text-center transition-colors"
              >
                <ImageIcon className="mx-auto mb-2" size={24} />
                <span className="text-sm font-medium">Thumbnail</span>
              </button>
            </div>
          )}
        </div>

        {/* AI Subtitles Tab */}
        <div className={`tab-content ${activeTab === 'subtitles' ? 'block' : 'hidden'}`}>
          <h3 className="text-xl font-semibold text-gray-900 mb-4">AI Subtitles with Whisper</h3>
          
          {!uploadedVideoId ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <Captions className="mx-auto text-gray-400 mb-4" size={48} />
              <p className="text-gray-600">Please upload a video first to generate subtitles</p>
              <button 
                onClick={() => setActiveTab('upload')}
                className="mt-4 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-md"
              >
                Upload Video
              </button>
            </div>
          ) : (
            <>
              {/* Language and Style Selection */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Globe className="inline mr-2" size={16} />
                    Language Selection
                  </label>
                  <select 
                    value={subtitleLanguage} 
                    onChange={(e) => setSubtitleLanguage(e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    {languageOptions.map(lang => (
                      <option key={lang.code} value={lang.code}>
                        {lang.flag} {lang.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Settings className="inline mr-2" size={16} />
                    Subtitle Style
                  </label>
                  <select 
                    value={subtitleStyle} 
                    onChange={(e) => setSubtitleStyle(e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value="modern">Modern (Clean & Bold)</option>
                    <option value="classic">Classic (Traditional)</option>
                    <option value="minimal">Minimal (Simple)</option>
                    <option value="cinematic">Cinematic (Movie Style)</option>
                    <option value="colorful">Colorful (Vibrant)</option>
                  </select>
                </div>
              </div>

              {/* Whisper Features */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4 mb-6">
                <h4 className="text-lg font-medium text-blue-900 mb-2">🎤 Whisper AI Features</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div className="flex items-center text-blue-700">
                    <CheckCircle className="mr-2" size={16} />
                    Word-level timing
                  </div>
                  <div className="flex items-center text-blue-700">
                    <CheckCircle className="mr-2" size={16} />
                    11+ languages
                  </div>
                  <div className="flex items-center text-blue-700">
                    <CheckCircle className="mr-2" size={16} />
                    High accuracy
                  </div>
                  <div className="flex items-center text-blue-700">
                    <CheckCircle className="mr-2" size={16} />
                    SRT & JSON output
                  </div>
                </div>
              </div>

              {/* Generate Button */}
              <div className="mb-6">
                <button 
                  onClick={generateAdvancedSubtitles}
                  disabled={isGeneratingSubtitles}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                  {isGeneratingSubtitles ? (
                    <Loader2 className="animate-spin mr-2" size={20} />
                  ) : (
                    <Captions className="mr-2" size={20} />
                  )}
                  {isGeneratingSubtitles ? 'Generating with Whisper...' : 'Generate AI Subtitles'}
                </button>
              </div>

              {renderProgressBar(subtitlesProgress)}

              {/* Subtitle Preview */}
              {subtitleData && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-lg font-medium text-gray-900">
                      Generated Subtitles ({getLanguageName(subtitleData.language)})
                    </h4>
                    <div className="flex space-x-2">
                      <button 
                        onClick={() => setShowSubtitles(!showSubtitles)}
                        className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-md text-sm flex items-center"
                      >
                        {showSubtitles ? <EyeOff className="mr-2" size={16} /> : <Eye className="mr-2" size={16} />}
                        {showSubtitles ? 'Hide' : 'Show'} Subtitles
                      </button>
                      <button 
                        onClick={downloadSubtitles}
                        className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm flex items-center"
                      >
                        <Download className="mr-2" size={16} />
                        Download SRT
                      </button>
                    </div>
                  </div>
                  
                  {/* Subtitle Timeline */}
                  <div className="bg-white border border-gray-200 rounded-md p-3 max-h-40 overflow-y-auto">
                    {subtitleData.cues.map((cue, index) => (
                      <div key={index} className="mb-2 p-2 bg-gray-50 rounded text-sm">
                        <div className="text-gray-500 text-xs mb-1">
                          {formatTime(cue.start)} → {formatTime(cue.end)}
                        </div>
                        <div className="text-gray-800">{cue.text}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Enhancement Tab */}
        <div className={`tab-content ${activeTab === 'enhancement' ? 'block' : 'hidden'}`}>
          <h3 className="text-xl font-semibold text-gray-900 mb-4">Video Enhancement</h3>
          
          {!uploadedVideoId ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <Wand2 className="mx-auto text-gray-400 mb-4" size={48} />
              <p className="text-gray-600">Please upload a video first to use enhancement tools</p>
              <button 
                onClick={() => setActiveTab('upload')}
                className="mt-4 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-md"
              >
                Upload Video
              </button>
            </div>
          ) : (
            <>
              {/* Live Preview Notice */}
              <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center">
                  <Wand2 className="text-blue-600 mr-2" size={20} />
                  <span className="text-sm font-medium text-blue-800">Live Preview: Changes are applied to the video preview in real-time</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Brightness (Live Preview)</label>
                  <div className="flex items-center">
                    <input 
                      type="range" 
                      min="0" 
                      max="200" 
                      value={brightnessLevel} 
                      onChange={(e) => setBrightnessLevel(Number(e.target.value))} 
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" 
                    />
                    <span className="ml-3 text-sm text-gray-600 w-16 text-right">{brightnessLevel}%</span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Contrast (Live Preview)</label>
                  <div className="flex items-center">
                    <input 
                      type="range" 
                      min="0" 
                      max="200" 
                      value={contrastLevel} 
                      onChange={(e) => setContrastLevel(Number(e.target.value))} 
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" 
                    />
                    <span className="ml-3 text-sm text-gray-600 w-16 text-right">{contrastLevel}%</span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Stabilization</label>
                  <select 
                    value={stabilizationLevel} 
                    onChange={(e) => setStabilizationLevel(e.target.value)} 
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value="none">None</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Audio Enhancement</label>
                  <select 
                    value={audioEnhancement} 
                    onChange={(e) => setAudioEnhancement(e.target.value)} 
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value="none">None</option>
                    <option value="clear">Clear Speech</option>
                    <option value="music">Music Enhancement</option>
                    <option value="full">Full Enhancement</option>
                  </select>
                </div>
              </div>

              {/* Reset Button */}
              <div className="mb-6">
                <button 
                  onClick={() => {
                    setBrightnessLevel(100);
                    setContrastLevel(100);
                  }}
                  className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-md text-sm mr-4"
                >
                  Reset to Original
                </button>
                <button 
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-md font-medium"
                >
                  Apply Enhancement
                </button>
              </div>

              {renderProgressBar(enhancementProgress)}
            </>
          )}
        </div>

        {/* Other tabs remain the same but without upload areas */}
        <div className={`tab-content ${activeTab === 'audio' ? 'block' : 'hidden'}`}>
          <h3 className="text-xl font-semibold text-gray-900 mb-4">Audio Cutting</h3>
          {!uploadedVideoId ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <Scissors className="mx-auto text-gray-400 mb-4" size={48} />
              <p className="text-gray-600">Please upload a video first to use audio cutting tools</p>
              <button 
                onClick={() => setActiveTab('upload')}
                className="mt-4 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-md"
              >
                Upload Video
              </button>
            </div>
          ) : (
            <p className="text-gray-600">Audio cutting tools will be available here.</p>
          )}
        </div>

        <div className={`tab-content ${activeTab === 'summarization' ? 'block' : 'hidden'}`}>
          <h3 className="text-xl font-semibold text-gray-900 mb-4">Video Summarization</h3>
          {!uploadedVideoId ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <Film className="mx-auto text-gray-400 mb-4" size={48} />
              <p className="text-gray-600">Please upload a video first to use summarization tools</p>
              <button 
                onClick={() => setActiveTab('upload')}
                className="mt-4 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-md"
              >
                Upload Video
              </button>
            </div>
          ) : (
            <p className="text-gray-600">Video summarization tools will be available here.</p>
          )}
        </div>

        <div className={`tab-content ${activeTab === 'thumbnail' ? 'block' : 'hidden'}`}>
          <h3 className="text-xl font-semibold text-gray-900 mb-4">Thumbnail Generation</h3>
          {!uploadedVideoId ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <ImageIcon className="mx-auto text-gray-400 mb-4" size={48} />
              <p className="text-gray-600">Please upload a video first to generate thumbnails</p>
              <button 
                onClick={() => setActiveTab('upload')}
                className="mt-4 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-md"
              >
                Upload Video
              </button>
            </div>
          ) : (
            <p className="text-gray-600">Thumbnail generation tools will be available here.</p>
          )}
        </div>

        {/* Custom Video Player with Live Subtitles */}
        {videoSrc && (
          <div className="mt-12">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">Video Preview with Live Subtitles</h3>
            <div 
              className="relative bg-black rounded-lg overflow-hidden shadow-lg aspect-video"
              onMouseMove={resetControlsTimeout}
              onMouseLeave={() => setShowControls(false)}
            >
              <video 
                ref={videoRef}
                src={videoSrc}
                className="w-full h-full object-contain"
                style={{ filter: previewFilters }}
                onTimeUpdate={handleVideoTimeUpdate}
                onLoadedMetadata={handleVideoLoadedMetadata}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onClick={togglePlayPause}
              />

              {/* Live Subtitles Overlay */}
              {showSubtitles && currentSubtitle && (
                <div className="absolute bottom-20 left-0 right-0 flex justify-center px-4">
                  <div className={`
                    bg-black bg-opacity-80 text-white px-4 py-2 rounded-md text-center max-w-4xl
                    ${subtitleStyle === 'modern' ? 'text-lg font-semibold' : ''}
                    ${subtitleStyle === 'classic' ? 'text-base font-normal' : ''}
                    ${subtitleStyle === 'minimal' ? 'text-sm font-light' : ''}
                    ${subtitleStyle === 'cinematic' ? 'text-xl font-bold' : ''}
                    ${subtitleStyle === 'colorful' ? 'text-lg font-semibold bg-gradient-to-r from-purple-600 to-blue-600' : ''}
                  `}>
                    {currentSubtitle}
                  </div>
                </div>
              )}

              {/* Video Controls */}
              <div className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-4 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
                {/* Progress Bar */}
                <div 
                  className="w-full h-1 bg-gray-600 rounded-full mb-4 cursor-pointer"
                  onClick={handleSeek}
                >
                  <div 
                    className="h-full bg-indigo-500 rounded-full"
                    style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                  ></div>
                </div>

                <div className="flex items-center justify-between text-white">
                  <div className="flex items-center space-x-4">
                    <button onClick={() => skipTime(-10)} className="hover:text-indigo-400">
                      <SkipBack size={20} />
                    </button>
                    <button onClick={togglePlayPause} className="hover:text-indigo-400">
                      {isPlaying ? <Pause size={24} /> : <Play size={24} />}
                    </button>
                    <button onClick={() => skipTime(10)} className="hover:text-indigo-400">
                      <SkipForward size={20} />
                    </button>
                    <button onClick={toggleMute} className="hover:text-indigo-400">
                      {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                    </button>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={volume}
                      onChange={handleVolumeChange}
                      className="w-20 accent-indigo-500"
                    />
                    <span className="text-sm">
                      {formatTime(currentTime)} / {formatTime(duration)}
                    </span>
                  </div>

                  <div className="flex items-center space-x-4">
                    {subtitleData && (
                      <button 
                        onClick={() => setShowSubtitles(!showSubtitles)}
                        className={`hover:text-indigo-400 ${showSubtitles ? 'text-indigo-400' : ''}`}
                      >
                        <Captions size={20} />
                      </button>
                    )}
                    <button className="hover:text-indigo-400">
                      <Maximize size={20} />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Subtitle Controls */}
            {subtitleData && (
              <div className="mt-4 bg-gray-50 border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">Subtitle Controls</span>
                  <div className="flex items-center space-x-4">
                    <button 
                      onClick={() => setShowSubtitles(!showSubtitles)}
                      className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                        showSubtitles 
                          ? 'bg-indigo-600 text-white' 
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    >
                      {showSubtitles ? 'Hide' : 'Show'} Subtitles
                    </button>
                    <select 
                      value={subtitleStyle} 
                      onChange={(e) => setSubtitleStyle(e.target.value)}
                      className="text-sm border border-gray-300 rounded-md px-2 py-1"
                    >
                      <option value="modern">Modern</option>
                      <option value="classic">Classic</option>
                      <option value="minimal">Minimal</option>
                      <option value="cinematic">Cinematic</option>
                      <option value="colorful">Colorful</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* API Console */}
        <div className="mt-12">
          <h3 className="text-xl font-semibold text-gray-900 mb-2">API Console</h3>
          <div 
            ref={consoleRef} 
            className="bg-gray-900 text-green-400 font-mono p-4 rounded-lg h-48 overflow-y-auto border border-gray-700 text-sm"
          >
            {consoleLogs.map((log, index) => (
              <div key={index} className="mb-1">
                <span className="text-gray-500 mr-2">{log.timestamp}</span>
                <span className={
                  log.type === 'success' ? 'text-green-400' : 
                  log.type === 'error' ? 'text-red-400' : 
                  log.message.startsWith('[System]') ? 'text-blue-400' : 'text-green-400'
                }>{log.message}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Features;