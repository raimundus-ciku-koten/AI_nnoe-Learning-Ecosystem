// web/src/components/ProfilGuruSekolah.jsx
import React from 'react';
import { useProfilGuru } from '../hooks/useProfilGuru';

export default function ProfilGuruSekolah() {
  const { profil, loading, error } = useProfilGuru();

  if (loading) {
    return (
      <div className="p-6 text-center text-gray-500">
        Memuat profil dari Firestore...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 text-red-600 rounded-lg border border-red-200">
        <strong>Error:</strong> {error}
        <p className="text-sm mt-2">Periksa koneksi internet atau Security Rules Anda.</p>
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
      <div className="flex items-center gap-2 mb-6 border-b pb-4">
        <svg className="w-6 h-6 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
        <h2 className="text-lg font-semibold text-gray-800">Akun Saya</h2>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 md:gap-4 items-center">
          <div className="text-gray-500 text-sm font-medium">Nama</div>
          <div className="md:col-span-3 text-gray-900 font-medium">{profil?.nama}</div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 md:gap-4 items-center border-t border-dashed pt-4">
          <div className="text-gray-500 text-sm font-medium">Email</div>
          <div className="md:col-span-3 text-gray-900">{profil?.email}</div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 md:gap-4 items-center border-t border-dashed pt-4">
          <div className="text-gray-500 text-sm font-medium">Peran</div>
          <div className="md:col-span-3 text-gray-900">{profil?.peran}</div>
        </div>
      </div>
    </div>
  );
}