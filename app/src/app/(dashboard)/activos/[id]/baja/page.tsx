'use client';

import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { BajaActivoForm } from '@/components/activos/BajaActivoForm';

export default function BajaActivoPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/activos/${id}`} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft size={24} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dar de Baja</h1>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <BajaActivoForm
          assetId={id}
          onSuccess={() => {
            router.push(`/activos/${id}`);
            router.refresh();
          }}
        />
      </div>
    </div>
  );
}