import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Crosshair,
  Image as ImageIcon,
  Loader2,
  MapPin,
  RefreshCw,
  Send,
} from 'lucide-react';
import type { Appraisal } from '../types/appraisal';
import type { TechnicalVisit } from '../types/technicalVisit';
import type {
  FieldEvidenceLocation,
  FieldEvidenceSet,
} from '../types/fieldEvidence';
import { useAuth } from '../auth/useAuth';
import { useOrganization } from '../organization/useOrganization';
import { useProperties } from '../properties/useProperties';
import { getFieldEvidenceGateway } from './fieldEvidenceGatewayFactory';
import {
  buildPropertyRegistryLocation,
  getFieldEvidenceCompleteness,
  toAppraisalFieldEvidenceSnapshot,
} from './fieldEvidencePolicy';
import { getClientRegistryRequestGateway } from '../clients/clientRegistryRequestGatewayFactory';
import { FIELD_VISIT_THEME } from './theme';
import { useFieldConnectivity } from './useFieldConnectivity';
import {
  FIELD_OFFLINE_EVIDENCE_MESSAGE,
  getGeolocationErrorMessage,
} from './fieldDevice';

const SOURCE_LABEL: Readonly<Record<FieldEvidenceLocation['source'], string>> = {
  property_reference: 'Cadastro do imóvel',
  property_geometry: 'Geometria do imóvel',
  device: 'GPS capturado e gravado no imóvel',
  manual: 'Coordenadas gravadas no imóvel',
};

export interface FieldEvidencePanelProps {
  readonly mode: 'visit' | 'appraisal' | 'registry';
  readonly visit?: TechnicalVisit;
  readonly appraisal?: Appraisal;
  readonly clientId?: string;
  readonly propertyId?: string;
  readonly registryRequestId?: string;
  readonly canEdit: boolean;
  readonly onEvidenceChange?: (evidence: FieldEvidenceSet) => void | Promise<void>;
}

export function FieldEvidencePanel({
  mode,
  visit,
  appraisal,
  clientId: explicitClientId,
  propertyId: explicitPropertyId,
  registryRequestId,
  canEdit,
  onEvidenceChange,
}: FieldEvidencePanelProps) {
  const navigate = useNavigate();
  const { session } = useAuth();
  const { activeOrganization } = useOrganization();
  const properties = useProperties();

  const evidenceGateway = useMemo(() => getFieldEvidenceGateway(), []);
  const requestGateway = useMemo(() => getClientRegistryRequestGateway(), []);

  const organizationId = activeOrganization?.id ?? null;
  const userId = session?.user?.id ?? null;
  const userRole = session?.organizationRole ?? 'none';
  const connectivity = useFieldConnectivity();
  const isOffline = connectivity === 'offline';

  const visitId = visit?.id;
  const appraisalId = appraisal?.id ?? visit?.appraisalId ?? undefined;
  const propertyId =
    explicitPropertyId ?? appraisal?.propertyId ?? visit?.propertyId ?? undefined;
  const clientId =
    explicitClientId ?? appraisal?.clientId ?? visit?.clientId ?? '';

  const [evidence, setEvidence] = useState<FieldEvidenceSet | null>(null);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [showEditor, setShowEditor] = useState(mode === 'registry');
  const [message, setMessage] = useState<string | null>(null);
  const [requestNotice, setRequestNotice] = useState<string | null>(null);
  const [manualLatitude, setManualLatitude] = useState('');
  const [manualLongitude, setManualLongitude] = useState('');

  const onEvidenceChangeRef = useRef(onEvidenceChange);
  onEvidenceChangeRef.current = onEvidenceChange;

  const completeness = useMemo(
    () => getFieldEvidenceCompleteness(evidence, propertyId),
    [evidence, propertyId]
  );

  const publish = useCallback(
    async (next: FieldEvidenceSet) => {
      setEvidence(next);

      if (
        next.location?.latitude !== null &&
        next.location?.latitude !== undefined
      ) {
        setManualLatitude(String(next.location.latitude));
      }

      if (
        next.location?.longitude !== null &&
        next.location?.longitude !== undefined
      ) {
        setManualLongitude(String(next.location.longitude));
      }

      await onEvidenceChangeRef.current?.(next);

      if (registryRequestId && organizationId) {
        try {
          await requestGateway.fulfill(organizationId, registryRequestId);
          setRequestNotice('Solicitação cadastral concluída.');
        } catch {
          // Permanece em andamento enquanto faltar algum item.
        }
      }
    },
    [organizationId, registryRequestId, requestGateway]
  );

  const initialize = useCallback(async () => {
    if (isOffline) {
      setLoading(false);
      setMessage(FIELD_OFFLINE_EVIDENCE_MESSAGE);
      return;
    }

    if (!organizationId || !userId || !clientId) {
      setEvidence(null);
      setLoading(false);
      return;
    }

    if (!propertyId) {
      setEvidence(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const property = await properties.getPropertyById(propertyId);
      if (!property) {
        throw new Error('O imóvel vinculado não foi encontrado.');
      }

      const belongsToClient = property.clientLinks.some(
        (link) => link.clientId === clientId
      );
      if (!belongsToClient) {
        throw new Error(
          'O imóvel selecionado não pertence ao cliente deste atendimento.'
        );
      }

      const registryLocation = buildPropertyRegistryLocation(property);

      const next = await evidenceGateway.initialize({
        organizationId,
        visitId,
        appraisalId,
        propertyId,
        clientId,
        actorUserId: userId,
        registryLocation,
      });

      await publish(next);

      if (registryRequestId) {
        try {
          await requestGateway.start(organizationId, registryRequestId);
        } catch {
          // Se já estiver em andamento/concluída, continua normalmente.
        }
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar fotos e localização do imóvel.'
      );
    } finally {
      setLoading(false);
    }
  }, [
    appraisalId,
    clientId,
    evidenceGateway,
    isOffline,
    organizationId,
    properties,
    propertyId,
    publish,
    registryRequestId,
    requestGateway,
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
        const url = await evidenceGateway.createPhotoUrl(photo);
        return [photo.id, url] as const;
      })
    )
      .then((entries) => {
        if (!active) return;
        setPhotoUrls(
          Object.fromEntries(
            entries.filter(
              (entry): entry is readonly [string, string] => Boolean(entry[1])
            )
          )
        );
      })
      .catch(() => {
        if (!active) return;
        setPhotoUrls({});
      });

    return () => {
      active = false;
    };
  }, [evidence, evidenceGateway]);

  const requestCapturer = async () => {
    if (isOffline) {
      setMessage(FIELD_OFFLINE_EVIDENCE_MESSAGE);
      return;
    }

    if (
      !organizationId ||
      !userId ||
      !clientId ||
      mode === 'registry' ||
      userRole !== 'project_designer'
    ) {
      return;
    }

    const sourceId = mode === 'visit' ? visitId : appraisalId;
    if (!sourceId) return;

    const scope = !propertyId
      ? 'property_registration'
      : !completeness.hasGeolocation && !completeness.hasPhotos
        ? 'photos_and_geolocation'
        : !completeness.hasGeolocation
          ? 'geolocation'
          : 'photos';

    setWorking(true);
    setRequestNotice(null);
    setMessage(null);

    try {
      const created = await requestGateway.create({
        organizationId,
        clientId,
        propertyId,
        requestedByUserId: userId,
        sourceType: mode === 'visit' ? 'visit' : 'appraisal',
        sourceId,
        scope,
        note:
          scope === 'property_registration'
            ? 'Cadastrar o imóvel do cliente e completar fotos e geolocalização.'
            : 'Completar o cadastro de fotos e geolocalização do imóvel.',
      });

      setRequestNotice(
        'Solicitação enviada ao captador responsável. Protocolo ' +
          created.id.slice(0, 8) +
          '.'
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível enviar a solicitação ao captador.'
      );
    } finally {
      setWorking(false);
    }
  };

  const registerNow = () => {
    if (!propertyId) {
      const params = new URLSearchParams();
      params.set('clientId', clientId);
      params.set('returnTo', window.location.pathname);
      const sourceId = mode === 'visit' ? visitId : appraisalId;
      if (sourceId) {
        params.set('sourceType', mode === 'visit' ? 'visit' : 'appraisal');
        params.set('sourceId', sourceId);
      }
      navigate('/imoveis/novo?' + params.toString());
      return;
    }
    setShowEditor(true);
  };

  const saveLocation = useCallback(
    async (location: FieldEvidenceLocation) => {
      if (!evidence || !organizationId || !userId || !canEdit) return;
      if (isOffline) {
        setMessage(FIELD_OFFLINE_EVIDENCE_MESSAGE);
        return;
      }

      setWorking(true);
      setMessage(null);

      try {
        const next = await evidenceGateway.setLocation({
          organizationId,
          evidenceId: evidence.id,
          actorUserId: userId,
          expectedVersion: evidence.version,
          location,
        });
        await publish(next);
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : 'Não foi possível salvar a localização do imóvel.'
        );
      } finally {
        setWorking(false);
      }
    },
    [canEdit, evidence, evidenceGateway, isOffline, organizationId, publish, userId]
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
        if (isOffline) {
          setManualLatitude(String(position.coords.latitude));
          setManualLongitude(String(position.coords.longitude));
          setWorking(false);
          setMessage(
            'Localização obtida no aparelho, mas ainda não foi gravada. Reconecte e salve as coordenadas.'
          );
          return;
        }

        void saveLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
          label: evidence?.location?.label,
          source: 'device',
          capturedAt: new Date(position.timestamp).toISOString(),
        }).finally(() => setWorking(false));
      },
      (error) => {
        setWorking(false);
        setMessage(getGeolocationErrorMessage(error.code));
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
    if (isOffline) {
      setMessage(FIELD_OFFLINE_EVIDENCE_MESSAGE);
      return;
    }

    if (
      !files ||
      !evidence ||
      !organizationId ||
      !userId ||
      !canEdit
    ) {
      return;
    }

    setWorking(true);
    setMessage(null);

    try {
      let current = evidence;

      for (const file of Array.from(files).slice(0, 10)) {
        current = await evidenceGateway.uploadPhoto(
          {
            organizationId,
            evidenceId: current.id,
            actorUserId: userId,
            expectedVersion: current.version,
            source:
              mode === 'visit'
                ? 'visit_capture'
                : mode === 'appraisal'
                  ? 'appraisal_capture'
                  : 'property_capture',
            latitude: current.location?.latitude ?? undefined,
            longitude: current.location?.longitude ?? undefined,
          },
          file
        );
      }

      await publish(current);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível adicionar a fotografia.'
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
          Carregando cadastro de fotos e geolocalização do imóvel...
        </div>
      </section>
    );
  }

  const missingDescription = !propertyId
    ? 'Este atendimento ainda não possui um imóvel cadastrado/vinculado.'
    : !completeness.hasGeolocation && !completeness.hasPhotos
      ? 'O imóvel ainda não possui geolocalização e fotografias cadastradas.'
      : !completeness.hasGeolocation
        ? 'O imóvel ainda não possui geolocalização cadastrada.'
        : !completeness.hasPhotos
          ? 'O imóvel ainda não possui fotografias cadastradas.'
          : null;

  return (
    <section
      id="property-field-evidence"
      className={FIELD_VISIT_THEME.surface + ' min-w-0 p-4 sm:p-5'}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 font-semibold text-[#0B3D2E]">
            <Camera className="h-5 w-5" aria-hidden="true" />
            Fotos e geolocalização do imóvel
          </h3>
          {/* Fonte canônica única do imóvel */}
          <p className="mt-1 text-sm text-[#0B3D2E]/70">
            Fonte única do imóvel. Cliente, laudo e visita/vistoria
            exibem exatamente este mesmo cadastro.
          </p>
        </div>

        {propertyId && (
          <button
            type="button"
            className={FIELD_VISIT_THEME.buttonSecondary}
            onClick={() => void initialize()}
            disabled={working}
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Atualizar
          </button>
        )}
      </div>

      {message && (
        <div
          role="alert"
          className={FIELD_VISIT_THEME.surfaceSoft + ' mt-4 p-3 text-sm font-medium'}
        >
          {message}
        </div>
      )}

      {requestNotice && (
        <div
          role="status"
          aria-live="polite"
          className="mt-4 rounded-xl border border-[#78C89A] bg-[#78C89A]/15 p-3 text-sm font-medium text-[#0B3D2E]"
        >
          {requestNotice}
        </div>
      )}

      {missingDescription && mode !== 'registry' && (
        <div className="mt-4 rounded-xl border border-[#0B3D2E]/20 bg-white p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#0B3D2E]" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-[#0B3D2E]">
                Cadastro cadastral incompleto
              </p>
              <p className="mt-1 text-sm text-[#0B3D2E]/70">
                {missingDescription}
              </p>

              {userRole === 'project_designer' && (
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    className={FIELD_VISIT_THEME.buttonPrimary}
                    onClick={registerNow}
                    disabled={working}
                  >
                    <MapPin className="h-4 w-4" aria-hidden="true" />
                    Cadastrar agora
                  </button>

                  <button
                    type="button"
                    className={FIELD_VISIT_THEME.buttonSecondary}
                    onClick={() => void requestCapturer()}
                    disabled={working}
                  >
                    <Send className="h-4 w-4" aria-hidden="true" />
                    Solicitar ao captador responsável
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {completeness.complete && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-[#78C89A] bg-[#78C89A]/10 p-3 text-sm font-medium text-[#0B3D2E]">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          Cadastro do imóvel completo e sincronizado.
        </div>
      )}

      {propertyId && (
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
                    {evidence.location.latitude ?? 'Não cadastrada'}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium">Longitude</dt>
                  <dd className="text-[#0B3D2E]/70">
                    {evidence.location.longitude ?? 'Não cadastrada'}
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
                Nenhuma localização cadastrada para este imóvel.
              </p>
            )}

            {canEdit && (showEditor || mode === 'registry') && (
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
                  Salvar no cadastro do imóvel
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
                          alt={photo.caption || 'Fotografia cadastrada do imóvel'}
                          className="aspect-square w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex aspect-square items-center justify-center p-3 text-center text-xs text-[#0B3D2E]/65">
                          Imagem protegida
                        </div>
                      )}

                      <figcaption className="p-2 text-xs text-[#0B3D2E]/70">
                        {photo.source === 'visit_capture'
                          ? 'Capturada na visita e gravada no imóvel'
                          : photo.source === 'appraisal_capture'
                            ? 'Capturada no laudo e gravada no imóvel'
                            : photo.source === 'property_document'
                              ? 'Documento fotográfico do imóvel'
                              : 'Cadastro do imóvel'}
                      </figcaption>
                    </figure>
                  );
                })}
              </div>
            ) : (
              <p className="mt-3 text-sm text-[#0B3D2E]/70">
                Nenhuma fotografia cadastrada para este imóvel.
              </p>
            )}

            {canEdit && (showEditor || mode === 'registry') && (
              <label className="mt-4 inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl bg-[#0B3D2E] px-4 py-2 text-sm font-semibold text-white focus-within:ring-2 focus-within:ring-[#78C89A]">
                <Camera className="h-4 w-4 text-[#78C89A]" aria-hidden="true" />
                Adicionar fotos ao imóvel
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
      )}

      {working && (
        <p
          role="status"
          aria-live="polite"
          className="mt-3 text-sm text-[#0B3D2E]/70"
        >
          Salvando cadastro do imóvel...
        </p>
      )}
    </section>
  );
}

export function appraisalEvidenceSnapshot(evidence: FieldEvidenceSet) {
  return toAppraisalFieldEvidenceSnapshot(evidence);
}
