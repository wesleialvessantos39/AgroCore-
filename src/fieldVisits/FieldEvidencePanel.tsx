import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  Crosshair,
  Image as ImageIcon,
  Loader2,
  MapPin,
  RefreshCw,
} from 'lucide-react';
import type { Appraisal } from '../types/appraisal';
import type { AppraisalTechnicalDossier } from '../types/appraisalDossier';
import type { TechnicalVisit } from '../types/technicalVisit';
import type {
  FieldEvidenceLocation,
  FieldEvidenceSet,
} from '../types/fieldEvidence';
import { useAuth } from '../auth/useAuth';
import { useOrganization } from '../organization/useOrganization';
import { useClients } from '../clients/useClients';
import { useProperties } from '../properties/useProperties';
import { useAppraisals } from '../appraisals/useAppraisals';
import { getFieldEvidenceGateway } from './fieldEvidenceGatewayFactory';
import {
  buildRegistryLocation,
  toAppraisalFieldEvidenceSnapshot,
} from './fieldEvidencePolicy';
import { FIELD_VISIT_THEME } from './theme';

const SOURCE_LABEL: Readonly<Record<FieldEvidenceLocation['source'], string>> = {
  appraisal: 'Laudo',
  property_reference: 'Cadastro do imóvel',
  property_geometry: 'Geometria do imóvel',
  registry_address: 'Endereço cadastrado',
  device: 'Localização capturada no dispositivo',
  manual: 'Coordenadas informadas',
};

export interface FieldEvidencePanelProps {
  readonly mode: 'visit' | 'appraisal';
  readonly visit?: TechnicalVisit;
  readonly appraisal?: Appraisal;
  readonly canEdit: boolean;
  readonly onEvidenceChange?: (evidence: FieldEvidenceSet) => void | Promise<void>;
}

function legacyReferencesFromDossier(
  dossier: AppraisalTechnicalDossier
): string[] {
  const values = new Set<string>();

  for (const item of dossier.improvements.items) {
    for (const reference of item.photoReferences ?? []) {
      const normalized = reference.trim();
      if (normalized) values.add(normalized);
    }
  }

  for (const reference of dossier.documentReferences) {
    if (reference.category === 'photo_report') {
      values.add(reference.id);
    }
  }

  return [...values];
}

export function FieldEvidencePanel({
  mode,
  visit,
  appraisal,
  canEdit,
  onEvidenceChange,
}: FieldEvidencePanelProps) {
  const { session } = useAuth();
  const { activeOrganization } = useOrganization();
  const clients = useClients();
  const properties = useProperties();
  const appraisals = useAppraisals();

  const gateway = useMemo(() => getFieldEvidenceGateway(), []);
  const organizationId = activeOrganization?.id ?? null;
  const userId = session?.user?.id ?? null;

  const visitId = visit?.id;
  const appraisalId = appraisal?.id ?? visit?.appraisalId ?? undefined;
  const propertyId = appraisal?.propertyId ?? visit?.propertyId ?? undefined;
  const clientId = appraisal?.clientId ?? visit?.clientId ?? '';

  const [evidence, setEvidence] = useState<FieldEvidenceSet | null>(null);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [manualLatitude, setManualLatitude] = useState('');
  const [manualLongitude, setManualLongitude] = useState('');
  const onEvidenceChangeRef = useRef(onEvidenceChange);
  onEvidenceChangeRef.current = onEvidenceChange;

  const publish = useCallback(
    async (next: FieldEvidenceSet) => {
      setEvidence(next);
      if (next.location?.latitude !== null && next.location?.latitude !== undefined) {
        setManualLatitude(String(next.location.latitude));
      }
      if (next.location?.longitude !== null && next.location?.longitude !== undefined) {
        setManualLongitude(String(next.location.longitude));
      }
      await onEvidenceChangeRef.current?.(next);
    },
    []
  );

  const initialize = useCallback(async () => {
    if (!organizationId || !userId || !clientId) {
      setEvidence(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const [property, client, dossier] = await Promise.all([
        propertyId ? properties.getPropertyById(propertyId) : Promise.resolve(null),
        clients.getClientById(clientId),
        appraisalId
          ? appraisals.getTechnicalDossier(appraisalId).catch(() => null)
          : Promise.resolve(null),
      ]);

      const locationFromAppraisal = dossier?.fieldEvidence?.location
        ? {
            ...dossier.fieldEvidence.location,
            source: 'appraisal' as const,
          }
        : undefined;
      const registryLocation =
        locationFromAppraisal ?? buildRegistryLocation(property, client);
      const legacyAppraisalPhotoReferences = dossier
        ? legacyReferencesFromDossier(dossier)
        : [];

      const next = await gateway.initialize({
        organizationId,
        visitId,
        appraisalId,
        propertyId,
        clientId,
        actorUserId: userId,
        registryLocation,
        legacyAppraisalPhotoReferences,
      });
      await publish(next);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar fotos e localização.'
      );
    } finally {
      setLoading(false);
    }
  }, [
    appraisalId,
    appraisals,
    clientId,
    clients,
    gateway,
    organizationId,
    propertyId,
    properties,
    publish,
    userId,
    visitId,
  ]);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => {
    if (!evidence) {
      setPhotoUrls({});
      return;
    }
    let active = true;
    void Promise.all(
      evidence.photos.map(async (photo) => {
        const url = await gateway.createPhotoUrl(photo);
        return [photo.id, url] as const;
      })
    ).then((entries) => {
      if (!active) return;
      setPhotoUrls(
        Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => Boolean(entry[1])))
      );
    });
    return () => {
      active = false;
    };
  }, [evidence, gateway]);

  const saveLocation = useCallback(
    async (location: FieldEvidenceLocation) => {
      if (!evidence || !organizationId || !userId || !canEdit) return;
      setWorking(true);
      setMessage(null);
      try {
        const next = await gateway.setLocation({
          organizationId,
          evidenceId: evidence.id,
          actorUserId: userId,
          expectedVersion: evidence.version,
          location,
        });
        await publish(next);
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : 'Não foi possível salvar a localização.'
        );
      } finally {
        setWorking(false);
      }
    },
    [canEdit, evidence, gateway, organizationId, publish, userId]
  );

  const captureDeviceLocation = () => {
    if (!navigator.geolocation) {
      setMessage('Este dispositivo não disponibiliza localização.');
      return;
    }
    setWorking(true);
    setMessage(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        void saveLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
          label: evidence?.location?.label,
          source: 'device',
          capturedAt: new Date(position.timestamp).toISOString(),
        }).finally(() => setWorking(false));
      },
      () => {
        setWorking(false);
        setMessage(
          'Não foi possível obter a localização. Autorize o acesso ou informe as coordenadas.'
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  };

  const saveManualLocation = () => {
    const latitude = Number(manualLatitude);
    const longitude = Number(manualLongitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setMessage('Informe latitude e longitude válidas.');
      return;
    }
    void saveLocation({
      latitude,
      longitude,
      label: evidence?.location?.label,
      source: 'manual',
      capturedAt: new Date().toISOString(),
    });
  };

  const uploadFiles = async (files: FileList | null) => {
    if (!files || !evidence || !organizationId || !userId || !canEdit) return;
    setWorking(true);
    setMessage(null);
    try {
      let current = evidence;
      for (const file of Array.from(files).slice(0, 10)) {
        current = await gateway.uploadPhoto(
          {
            organizationId,
            evidenceId: current.id,
            actorUserId: userId,
            expectedVersion: current.version,
            source: mode === 'visit' ? 'visit_capture' : 'appraisal_capture',
            latitude: current.location?.latitude ?? undefined,
            longitude: current.location?.longitude ?? undefined,
          },
          file
        );
      }
      await publish(current);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Não foi possível adicionar a foto.'
      );
    } finally {
      setWorking(false);
    }
  };

  if (loading) {
    return (
      <section
        className={FIELD_VISIT_THEME.surface + ' p-4'}
        aria-busy="true"
        aria-live="polite"
      >
        <div className="flex items-center gap-2 text-sm text-[#0B3D2E]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Carregando fotos e localização...
        </div>
      </section>
    );
  }

  return (
    <section className={FIELD_VISIT_THEME.surface + ' min-w-0 p-4 sm:p-5'}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 font-semibold text-[#0B3D2E]">
            <Camera className="h-5 w-5" aria-hidden="true" />
            Fotos e geolocalização
          </h3>
          <p className="mt-1 text-sm text-[#0B3D2E]/70">
            As mesmas evidências são compartilhadas entre o laudo e a visita ou vistoria vinculada.
          </p>
        </div>
        <button
          type="button"
          className={FIELD_VISIT_THEME.buttonSecondary}
          onClick={() => void initialize()}
          disabled={working}
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Atualizar
        </button>
      </div>

      {message && (
        <div
          role="alert"
          className={FIELD_VISIT_THEME.surfaceSoft + ' mt-4 p-3 text-sm font-medium'}
        >
          {message}
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className={FIELD_VISIT_THEME.surfaceSoft + ' min-w-0 p-4'}>
          <h4 className="flex items-center gap-2 text-sm font-semibold text-[#0B3D2E]">
            <MapPin className="h-4 w-4" aria-hidden="true" />
            Localização
          </h4>

          {evidence?.location ? (
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="font-medium">Origem</dt>
                <dd className="break-words text-[#0B3D2E]/70">
                  {SOURCE_LABEL[evidence.location.source]}
                </dd>
              </div>
              <div>
                <dt className="font-medium">Referência</dt>
                <dd className="break-words text-[#0B3D2E]/70">
                  {evidence.location.label || 'Sem descrição cadastral'}
                </dd>
              </div>
              <div>
                <dt className="font-medium">Latitude</dt>
                <dd className="text-[#0B3D2E]/70">
                  {evidence.location.latitude ?? 'Não informada'}
                </dd>
              </div>
              <div>
                <dt className="font-medium">Longitude</dt>
                <dd className="text-[#0B3D2E]/70">
                  {evidence.location.longitude ?? 'Não informada'}
                </dd>
              </div>
              {evidence.location.accuracyMeters !== undefined && (
                <div className="sm:col-span-2">
                  <dt className="font-medium">Precisão aproximada</dt>
                  <dd className="text-[#0B3D2E]/70">
                    {Math.round(evidence.location.accuracyMeters)} m
                  </dd>
                </div>
              )}
            </dl>
          ) : (
            <p className="mt-3 text-sm text-[#0B3D2E]/70">
              Nenhuma localização cadastrada foi encontrada.
            </p>
          )}

          {canEdit && (
            <div className="mt-4 space-y-3">
              <button
                type="button"
                className={FIELD_VISIT_THEME.buttonPrimary}
                onClick={captureDeviceLocation}
                disabled={working}
              >
                <Crosshair className="h-4 w-4" aria-hidden="true" />
                Usar localização do dispositivo
              </button>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1.5 text-sm font-medium">
                  <span>Latitude</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    className={FIELD_VISIT_THEME.input}
                    value={manualLatitude}
                    onChange={(event) => setManualLatitude(event.target.value)}
                  />
                </label>
                <label className="space-y-1.5 text-sm font-medium">
                  <span>Longitude</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    className={FIELD_VISIT_THEME.input}
                    value={manualLongitude}
                    onChange={(event) => setManualLongitude(event.target.value)}
                  />
                </label>
              </div>
              <button
                type="button"
                className={FIELD_VISIT_THEME.buttonSecondary}
                onClick={saveManualLocation}
                disabled={working}
              >
                Salvar coordenadas informadas
              </button>
            </div>
          )}
        </div>

        <div className={FIELD_VISIT_THEME.surfaceSoft + ' min-w-0 p-4'}>
          <h4 className="flex items-center gap-2 text-sm font-semibold text-[#0B3D2E]">
            <ImageIcon className="h-4 w-4" aria-hidden="true" />
            Fotografias
          </h4>

          {evidence?.photos.length ? (
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {evidence.photos.map((photo) => {
                const url = photoUrls[photo.id];
                return (
                  <figure
                    key={photo.id}
                    className="min-w-0 overflow-hidden rounded-xl border border-[#0B3D2E]/15 bg-white"
                  >
                    {url ? (
                      <img
                        src={url}
                        alt={photo.caption || 'Fotografia técnica vinculada'}
                        className="aspect-square w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex aspect-square items-center justify-center p-3 text-center text-xs text-[#0B3D2E]/65">
                        {photo.legacyReference
                          ? 'Referência fotográfica existente no laudo'
                          : 'Imagem protegida'}
                      </div>
                    )}
                    <figcaption className="p-2 text-xs text-[#0B3D2E]/70">
                      {photo.source === 'visit_capture'
                        ? 'Registrada na visita'
                        : photo.source === 'appraisal_capture'
                          ? 'Registrada no laudo'
                          : photo.source === 'registry_document'
                            ? 'Importada do cadastro'
                            : 'Importada do laudo'}
                    </figcaption>
                  </figure>
                );
              })}
            </div>
          ) : (
            <p className="mt-3 text-sm text-[#0B3D2E]/70">
              Nenhuma fotografia vinculada até o momento.
            </p>
          )}

          {canEdit && (
            <label className="mt-4 inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl bg-[#0B3D2E] px-4 py-2 text-sm font-semibold text-white focus-within:ring-2 focus-within:ring-[#78C89A]">
              <Camera className="h-4 w-4 text-[#78C89A]" aria-hidden="true" />
              Adicionar fotos
              <input
                type="file"
                accept="image/jpeg,image/png,image/tiff"
                capture="environment"
                multiple
                className="sr-only"
                disabled={working}
                onChange={(event) => {
                  void uploadFiles(event.target.files);
                  event.currentTarget.value = '';
                }}
              />
            </label>
          )}
        </div>
      </div>

      {working && (
        <p role="status" aria-live="polite" className="mt-3 text-sm text-[#0B3D2E]/70">
          Salvando evidências...
        </p>
      )}

      {evidence && appraisalId && (
        <p className="mt-3 text-xs text-[#0B3D2E]/60">
          Evidências vinculadas ao laudo e mantidas sincronizadas automaticamente.
        </p>
      )}
    </section>
  );
}

export function appraisalEvidenceSnapshot(evidence: FieldEvidenceSet) {
  return toAppraisalFieldEvidenceSnapshot(evidence);
}
