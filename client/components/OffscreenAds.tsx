import React from 'react';

export default function OffscreenAds() {
  return (
    <div className="fixed top-0 right-0 h-full z-30 pointer-events-none">
      {/* Position ads off-screen to the right */}
      <div className="transform translate-x-full h-full flex flex-col">
        {/* Top skinny ad */}
        <div className="w-32 h-64 bg-gray-800/90 border border-gray-600 m-2 rounded-lg pointer-events-auto">
          <div className="p-2 text-xs text-gray-300 text-center">
            <div className="mb-2 text-gray-400">Advertisement</div>
            <div className="bg-gray-700 h-48 rounded flex items-center justify-center">
              <span className="text-gray-500 text-xs">Skinny Ad 1</span>
            </div>
          </div>
        </div>

        {/* Middle skinny ad */}
        <div className="w-32 h-64 bg-gray-800/90 border border-gray-600 m-2 rounded-lg pointer-events-auto">
          <div className="p-2 text-xs text-gray-300 text-center">
            <div className="mb-2 text-gray-400">Advertisement</div>
            <div className="bg-gray-700 h-48 rounded flex items-center justify-center">
              <span className="text-gray-500 text-xs">Skinny Ad 2</span>
            </div>
          </div>
        </div>

        {/* Bottom skinny ad */}
        <div className="w-32 h-64 bg-gray-800/90 border border-gray-600 m-2 rounded-lg pointer-events-auto">
          <div className="p-2 text-xs text-gray-300 text-center">
            <div className="mb-2 text-gray-400">Advertisement</div>
            <div className="bg-gray-700 h-48 rounded flex items-center justify-center">
              <span className="text-gray-500 text-xs">Skinny Ad 3</span>
            </div>
          </div>
        </div>

        {/* Additional skinny ads for more coverage */}
        <div className="w-32 h-48 bg-gray-800/90 border border-gray-600 m-2 rounded-lg pointer-events-auto">
          <div className="p-2 text-xs text-gray-300 text-center">
            <div className="mb-2 text-gray-400">Advertisement</div>
            <div className="bg-gray-700 h-32 rounded flex items-center justify-center">
              <span className="text-gray-500 text-xs">Skinny Ad 4</span>
            </div>
          </div>
        </div>
      </div>

      {/* Alternative positioning - further right with different heights */}
      <div className="absolute top-0 left-36 h-full flex flex-col">
        {/* Tall vertical banner */}
        <div className="w-24 h-80 bg-gray-800/80 border border-gray-600 m-1 rounded-lg pointer-events-auto">
          <div className="p-1 text-xs text-gray-300 text-center">
            <div className="mb-1 text-gray-400 text-xs">Ad</div>
            <div className="bg-gray-700 h-72 rounded flex items-center justify-center">
              <span className="text-gray-500 text-xs transform -rotate-90 whitespace-nowrap">Vertical Banner</span>
            </div>
          </div>
        </div>

        {/* Small square ads */}
        <div className="w-24 h-24 bg-gray-800/80 border border-gray-600 m-1 rounded-lg pointer-events-auto">
          <div className="p-1 text-xs text-gray-300 text-center">
            <div className="bg-gray-700 h-16 rounded flex items-center justify-center">
              <span className="text-gray-500 text-xs">Square</span>
            </div>
          </div>
        </div>

        <div className="w-24 h-24 bg-gray-800/80 border border-gray-600 m-1 rounded-lg pointer-events-auto">
          <div className="p-1 text-xs text-gray-300 text-center">
            <div className="bg-gray-700 h-16 rounded flex items-center justify-center">
              <span className="text-gray-500 text-xs">Square</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
