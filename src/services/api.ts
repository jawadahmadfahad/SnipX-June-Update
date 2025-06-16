import { z } from 'zod';

const API_URL = 'http://localhost:5001/api';

// Validation schemas
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(2),
  lastName: z.string().min(2)
});

const videoOptionsSchema = z.object({
  cut_silence: z.boolean().optional(),
  enhance_audio: z.boolean().optional(),
  generate_thumbnail: z.boolean().optional(),
  generate_subtitles: z.boolean().optional(),
  summarize: z.boolean().optional(),
  // Enhancement specific options
  stabilization: z.string().optional(),
  audio_enhancement_type: z.string().optional(),
  brightness: z.number().optional(),
  contrast: z.number().optional(),
  // Subtitle specific options
  subtitle_language: z.string().optional(),
  subtitle_style: z.string().optional()
});

export class ApiService {
  private static token: string | null = null;

  static setToken(token: string) {
    this.token = token;
    localStorage.setItem('token', token);
  }

  static getToken(): string | null {
    if (!this.token) {
      this.token = localStorage.getItem('token');
    }
    return this.token;
  }

  static clearToken() {
    this.token = null;
    localStorage.removeItem('token');
  }

  private static async request(endpoint: string, options: RequestInit = {}) {
    const token = this.getToken();
    const isForm = options.body instanceof FormData;

    const headers: HeadersInit = {
      // Only set JSON content-type when not sending FormData
      ...(isForm ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    };

    try {
      const res = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers
      });

      if (!res.ok) {
        // Try to parse JSON error, fallback to text
        let msg = `HTTP ${res.status}`;
        try {
          const payload = await res.json();
          msg = payload.message || payload.error || msg;
        } catch {
          msg = await res.text();
        }
        throw new Error(msg);
      }

      // Handle no-content responses
      if (res.status === 204) {
        return null;
      }

      return await res.json();
    } catch (err) {
      console.error('API request failed:', err);
      throw err;
    }
  }

  static async login(email: string, password: string) {
    const validated = loginSchema.parse({ email, password });
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify(validated)
    });
    this.setToken(data.token);
    return data;
  }

  static async register(data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  }) {
    const validated = registerSchema.parse(data);
    return this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(validated)
    });
  }

  static async uploadVideo(file: File) {
    const formData = new FormData();
    formData.append('video', file);
    return this.request('/upload', {
      method: 'POST',
      body: formData
    });
  }

  static async processVideo(videoId: string, options: {
    cut_silence?: boolean;
    enhance_audio?: boolean;
    generate_thumbnail?: boolean;
    generate_subtitles?: boolean;
    summarize?: boolean;
    // Enhancement specific options
    stabilization?: string;
    audio_enhancement_type?: string;
    brightness?: number;
    contrast?: number;
    // Subtitle specific options
    subtitle_language?: string;
    subtitle_style?: string;
  }) {
    const validated = videoOptionsSchema.parse(options);
    return this.request(`/videos/${videoId}/process`, {
      method: 'POST',
      body: JSON.stringify({ options: validated })
    });
  }

  static async getVideoStatus(videoId: string) {
    return this.request(`/videos/${videoId}`);
  }

  static async getUserVideos() {
    return this.request('/videos');
  }

  static async deleteVideo(videoId: string) {
    return this.request(`/videos/${videoId}`, {
      method: 'DELETE'
    });
  }

  // Enhanced subtitle generation with Whisper
  static async generateAdvancedSubtitles(videoId: string, options: {
    language: string;
    style: string;
    format?: 'srt' | 'json' | 'both';
  }) {
    return this.request(`/videos/${videoId}/subtitles/advanced`, {
      method: 'POST',
      body: JSON.stringify(options)
    });
  }

  // Get subtitle data in JSON format for live preview
  static async getSubtitleData(videoId: string, language: string) {
    return this.request(`/videos/${videoId}/subtitles/${language}/json`);
  }

  // Download processed video
  static async downloadVideo(videoId: string): Promise<Blob> {
    const token = this.getToken();
    const response = await fetch(`${API_URL}/videos/${videoId}/download`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    });

    if (!response.ok) {
      throw new Error('Download failed');
    }

    return response.blob();
  }

  // Download subtitle file
  static async downloadSubtitles(videoId: string, language: string, format: 'srt' | 'json' = 'srt'): Promise<Blob> {
    const token = this.getToken();
    const response = await fetch(`${API_URL}/videos/${videoId}/subtitles/${language}/download?format=${format}`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    });

    if (!response.ok) {
      throw new Error('Subtitle download failed');
    }

    return response.blob();
  }
}