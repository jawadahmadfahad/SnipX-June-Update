import os
from datetime import datetime
from models.video import Video
from bson.objectid import ObjectId
from werkzeug.utils import secure_filename
import magic
import cv2
import numpy as np
from moviepy.editor import VideoFileClip
from pydub import AudioSegment
import tensorflow as tf
from transformers import pipeline

class VideoService:
    def __init__(self, db):
        self.db = db
        self.videos = db.videos
        self.upload_folder = os.getenv('UPLOAD_FOLDER', 'uploads')
        self.max_content_length = int(os.getenv('MAX_CONTENT_LENGTH', 500 * 1024 * 1024))
        
        # Initialize AI models
        try:
            self.summarizer = pipeline("summarization", model="facebook/bart-large-cnn")
            self.speech_recognizer = pipeline("automatic-speech-recognition")
        except Exception as e:
            print(f"Warning: Could not initialize AI models: {e}")
            self.summarizer = None
            self.speech_recognizer = None

    def save_video(self, file, user_id):
        if not file:
            raise ValueError("No file provided")

        filename = secure_filename(file.filename)
        filepath = os.path.join(self.upload_folder, filename)
        
        # Create upload directory if it doesn't exist
        os.makedirs(self.upload_folder, exist_ok=True)
        
        # Save file
        file.save(filepath)
        
        # Validate file
        if not self._is_valid_video(filepath):
            os.remove(filepath)
            raise ValueError("Invalid video file")

        # Create video document
        video = Video(
            user_id=ObjectId(user_id),
            filename=filename,
            filepath=filepath,
            size=os.path.getsize(filepath)
        )
        
        # Extract metadata
        self._extract_metadata(video)
        
        # Save to database
        result = self.videos.insert_one(video.to_dict())
        return str(result.inserted_id)

    def process_video(self, video_id, options):
        video = self.get_video(video_id)
        if not video:
            raise ValueError("Video not found")

        video.status = "processing"
        video.process_start_time = datetime.utcnow()
        video.processing_options = options
        
        try:
            # Enhanced processing with actual options
            if options.get('cut_silence'):
                self._cut_silence(video)
            
            if options.get('enhance_audio'):
                self._enhance_audio(video, options)
            
            if options.get('generate_thumbnail'):
                self._generate_thumbnail(video)
            
            if options.get('generate_subtitles'):
                self._generate_subtitles(video)
            
            if options.get('summarize'):
                self._summarize_video(video)

            # Apply video enhancements
            if any([options.get('stabilization'), options.get('brightness'), options.get('contrast')]):
                self._apply_video_enhancements(video, options)

            video.status = "completed"
            video.process_end_time = datetime.utcnow()
            
        except Exception as e:
            video.status = "failed"
            video.error = str(e)
            video.process_end_time = datetime.utcnow()
            raise
        
        finally:
            self.videos.update_one(
                {"_id": ObjectId(video_id)},
                {"$set": video.to_dict()}
            )

    def get_video(self, video_id):
        video_data = self.videos.find_one({"_id": ObjectId(video_id)})
        if not video_data:
            return None
        return Video.from_dict(video_data)

    def get_user_videos(self, user_id):
        videos = self.videos.find({"user_id": ObjectId(user_id)})
        return [Video.from_dict(video).to_dict() for video in videos]

    def delete_video(self, video_id, user_id):
        video = self.get_video(video_id)
        if not video:
            raise ValueError("Video not found")
        
        if str(video.user_id) != str(user_id):
            raise ValueError("Unauthorized")
        
        # Delete file
        if os.path.exists(video.filepath):
            os.remove(video.filepath)
        
        # Delete processed files
        if video.outputs.get('processed_video') and os.path.exists(video.outputs['processed_video']):
            os.remove(video.outputs['processed_video'])
        
        # Delete from database
        self.videos.delete_one({"_id": ObjectId(video_id)})

    def _is_valid_video(self, filepath):
        try:
            mime = magic.Magic(mime=True)
            file_type = mime.from_file(filepath)
            return file_type.startswith('video/')
        except:
            # Fallback: check file extension
            valid_extensions = ['.mp4', '.avi', '.mov', '.mkv', '.wmv', '.flv']
            return any(filepath.lower().endswith(ext) for ext in valid_extensions)

    def _extract_metadata(self, video):
        try:
            clip = VideoFileClip(video.filepath)
            video.metadata.update({
                "duration": clip.duration,
                "fps": clip.fps,
                "resolution": f"{clip.size[0]}x{clip.size[1]}",
                "format": os.path.splitext(video.filename)[1][1:]
            })
            clip.close()
        except Exception as e:
            print(f"Error extracting metadata: {e}")
            video.metadata.update({
                "format": os.path.splitext(video.filename)[1][1:]
            })

    def _apply_video_enhancements(self, video, options):
        """Apply video enhancements like brightness, contrast, stabilization"""
        try:
            clip = VideoFileClip(video.filepath)
            
            # Apply brightness and contrast adjustments
            brightness = options.get('brightness', 100) / 100.0  # Convert percentage to multiplier
            contrast = options.get('contrast', 100) / 100.0
            
            if brightness != 1.0 or contrast != 1.0:
                def adjust_brightness_contrast(image):
                    # Convert to float for calculations
                    img = image.astype(np.float32)
                    
                    # Apply brightness (additive)
                    if brightness != 1.0:
                        img = img * brightness
                    
                    # Apply contrast (multiplicative around midpoint)
                    if contrast != 1.0:
                        img = (img - 128) * contrast + 128
                    
                    # Clip values to valid range
                    img = np.clip(img, 0, 255)
                    return img.astype(np.uint8)
                
                clip = clip.fl_image(adjust_brightness_contrast)
            
            # Apply stabilization (basic implementation)
            stabilization = options.get('stabilization', 'none')
            if stabilization != 'none':
                # For now, we'll just apply a simple smoothing
                # In a real implementation, you'd use more sophisticated stabilization
                pass
            
            # Save enhanced video
            output_path = f"{os.path.splitext(video.filepath)[0]}_enhanced.mp4"
            clip.write_videofile(output_path, codec='libx264', audio_codec='aac')
            video.outputs["processed_video"] = output_path
            
            clip.close()
            
        except Exception as e:
            print(f"Error applying video enhancements: {e}")
            raise

    def _cut_silence(self, video):
        try:
            audio = AudioSegment.from_file(video.filepath)
            chunks = []
            silence_thresh = -40
            min_silence_len = 500
            
            # Process audio in chunks
            chunk_length = 10000
            for i in range(0, len(audio), chunk_length):
                chunk = audio[i:i + chunk_length]
                if chunk.dBFS > silence_thresh:
                    chunks.append(chunk)
            
            # Combine non-silent chunks
            processed_audio = AudioSegment.empty()
            for chunk in chunks:
                processed_audio += chunk
            
            # Save processed audio
            output_path = f"{os.path.splitext(video.filepath)[0]}_processed.mp4"
            processed_audio.export(output_path, format="mp4")
            video.outputs["processed_video"] = output_path
        except Exception as e:
            print(f"Error cutting silence: {e}")

    def _enhance_audio(self, video, options):
        try:
            audio = AudioSegment.from_file(video.filepath)
            
            # Get enhancement type
            enhancement_type = options.get('audio_enhancement_type', 'full')
            
            # Apply audio enhancements based on type
            if enhancement_type == 'clear':
                # Focus on speech clarity
                enhanced = audio.normalize()
                enhanced = enhanced.high_pass_filter(80)  # Remove low frequency noise
            elif enhancement_type == 'music':
                # Focus on music enhancement
                enhanced = audio.normalize()
                enhanced = enhanced.compress_dynamic_range()
            else:  # 'full' enhancement
                enhanced = audio.normalize()
                enhanced = enhanced.compress_dynamic_range()
                enhanced = enhanced.high_pass_filter(80)
            
            # Save enhanced audio
            output_path = f"{os.path.splitext(video.filepath)[0]}_enhanced_audio.mp4"
            enhanced.export(output_path, format="mp4")
            video.outputs["processed_video"] = output_path
        except Exception as e:
            print(f"Error enhancing audio: {e}")

    def _generate_thumbnail(self, video):
        try:
            cap = cv2.VideoCapture(video.filepath)
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            cap.set(cv2.CAP_PROP_POS_FRAMES, total_frames // 2)
            ret, frame = cap.read()
            
            if ret:
                thumbnail_path = f"{os.path.splitext(video.filepath)[0]}_thumb.jpg"
                cv2.imwrite(thumbnail_path, frame)
                video.outputs["thumbnail"] = thumbnail_path
            
            cap.release()
        except Exception as e:
            print(f"Error generating thumbnail: {e}")

    def _generate_subtitles(self, video):
        if not self.speech_recognizer:
            print("Speech recognizer not available")
            return
            
        try:
            # Extract audio
            clip = VideoFileClip(video.filepath)
            audio_path = f"{os.path.splitext(video.filepath)[0]}_audio.wav"
            clip.audio.write_audiofile(audio_path)
            
            # Generate transcription
            transcription = self.speech_recognizer(audio_path)
            
            # Save subtitles in SRT format
            srt_path = f"{os.path.splitext(video.filepath)[0]}.srt"
            with open(srt_path, 'w', encoding='utf-8') as f:
                # Simple subtitle format (in real implementation, you'd have proper timing)
                f.write("1\n")
                f.write("00:00:00,000 --> 00:00:10,000\n")
                f.write(f"{transcription.get('text', 'No transcription available')}\n\n")
            
            video.outputs["subtitles"] = srt_path
            clip.close()
            if os.path.exists(audio_path):
                os.remove(audio_path)
        except Exception as e:
            print(f"Error generating subtitles: {e}")

    def _summarize_video(self, video):
        if not self.summarizer or not self.speech_recognizer:
            print("AI models not available for summarization")
            return
            
        try:
            # Extract audio and convert to text
            clip = VideoFileClip(video.filepath)
            audio_path = f"{os.path.splitext(video.filepath)[0]}_audio.wav"
            clip.audio.write_audiofile(audio_path)
            
            # Generate transcription
            transcription = self.speech_recognizer(audio_path)
            text = transcription.get('text', '')
            
            if text:
                # Summarize text
                summary = self.summarizer(text, max_length=130, min_length=30)
                
                # Save summary
                summary_path = f"{os.path.splitext(video.filepath)[0]}_summary.txt"
                with open(summary_path, 'w', encoding='utf-8') as f:
                    f.write(summary[0]['summary_text'])
                
                video.outputs["summary"] = summary_path
            
            clip.close()
            if os.path.exists(audio_path):
                os.remove(audio_path)
        except Exception as e:
            print(f"Error summarizing video: {e}")

    def _format_timestamp(self, seconds):
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        seconds = int(seconds % 60)
        milliseconds = int((seconds % 1) * 1000)
        return f"{hours:02d}:{minutes:02d}:{seconds:02d},{milliseconds:03d}"