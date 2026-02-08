'use client';

import { useState } from 'react';
import { FaTimes, FaDownload, FaImage, FaFilePdf, FaFileWord, FaFileExcel, FaFile } from 'react-icons/fa';
import { Attachment } from '@/lib/types';
import { formatFileSize } from '@/utils/imageCompression';

interface AttachmentGalleryProps {
  attachments: Attachment[];
  onDelete?: (attachmentId: string) => void;
  canDelete?: boolean;
  compact?: boolean; // Minimal inline view
}

export default function AttachmentGallery({
  attachments,
  onDelete,
  canDelete = false,
  compact = true,
}: AttachmentGalleryProps) {
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  if (!attachments || attachments.length === 0) return null;

  const getFileIcon = (type: string, name: string) => {
    if (type === 'image') return <FaImage />;
    
    const ext = name.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return <FaFilePdf className="text-red-500" />;
    if (ext === 'doc' || ext === 'docx') return <FaFileWord className="text-blue-500" />;
    if (ext === 'xls' || ext === 'xlsx') return <FaFileExcel className="text-green-500" />;
    return <FaFile />;
  };

  return (
    <>
      {/* Compact inline view */}
      {compact && (
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="relative group"
            >
              {attachment.type === 'image' ? (
                <div className="relative">
                  <button
                    onClick={() => setLightboxImage(attachment.url)}
                    className="relative w-16 h-16 rounded-lg overflow-hidden border-2 border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-400 transition-all"
                  >
                    <img
                      src={attachment.thumbnailUrl || attachment.url}
                      alt={attachment.name}
                      className="w-full h-full object-cover"
                    />
                  </button>
                  {canDelete && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete?.(attachment.id);
                      }}
                      className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-red-600 transition-colors z-10"
                      title="Delete attachment"
                    >
                      <FaTimes size={12} />
                    </button>
                  )}
                </div>
              ) : (
                <div className="relative flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 group">
                  <a
                    href={attachment.url}
                    download={attachment.name}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 flex-1 min-w-0 hover:opacity-80 transition-opacity"
                  >
                    <span className="text-gray-600 dark:text-gray-400">
                      {getFileIcon(attachment.type, attachment.name)}
                    </span>
                    <div className="flex flex-col min-w-0">
                      <span className="text-gray-900 dark:text-white text-xs truncate max-w-[100px]">
                        {attachment.name}
                      </span>
                      <span className="text-gray-500 dark:text-gray-400 text-[10px]">
                        {formatFileSize(attachment.size)}
                      </span>
                    </div>
                  </a>
                  {canDelete && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onDelete?.(attachment.id);
                      }}
                      className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                      title="Delete attachment"
                    >
                      <FaTimes size={10} />
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Lightbox for full-screen image view */}
      {lightboxImage && (
        <div
          className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200"
          onClick={() => setLightboxImage(null)}
        >
          <button
            onClick={() => setLightboxImage(null)}
            className="absolute top-4 right-4 text-white bg-black bg-opacity-50 p-3 rounded-full hover:bg-opacity-70 transition-all"
          >
            <FaTimes size={20} />
          </button>
          <a
            href={lightboxImage}
            download
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="absolute top-4 left-4 text-white bg-black bg-opacity-50 p-3 rounded-full hover:bg-opacity-70 transition-all"
          >
            <FaDownload size={20} />
          </a>
          <img
            src={lightboxImage}
            alt="Full size"
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
