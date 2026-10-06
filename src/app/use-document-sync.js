import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  defaultDocumentForSlug,
  documentFromRow,
  normalizeDesignMetadata,
  upsertDocumentRow,
} from "@/lib/svg/workspace";
import { serializeSvgDocument } from "@/lib/svg/svg-document";
import {
  deleteDesignDocument,
  loadDesignDocument,
  loadDesignDocuments,
  loadDesignRevisions,
  restoreDesignRevision,
  saveDesignDocument,
} from "./client";
import { forgetCanvas, writeActiveSlug, writeCanvasSource } from "./storage";

const AUTOSAVE_DELAY_MS = 650;

export function useDocumentSync({
  activeSlug,
  document,
  selectedPathName,
  onServerDocument,
  onLoadError,
}) {
  const [designDocuments, setDesignDocuments] = useState([]);
  const [revisions, setRevisions] = useState([]);
  const [isLoadingRevisions, setIsLoadingRevisions] = useState(false);
  const [saveStatus, setSaveStatus] = useState("loading");
  const [loaded, setLoaded] = useState(false);
  const lastSavedRef = useRef({ svg: "", metadata: "", name: "" });
  const editSourceRef = useRef("autosave");
  const activeDocument =
    designDocuments.find((item) => item.slug === activeSlug) || null;

  const rememberSaved = useCallback((row) => {
    lastSavedRef.current = {
      svg: row.svg,
      metadata: JSON.stringify(row.metadata || {}),
      name: row.name,
    };
    setDesignDocuments((current) => upsertDocumentRow(current, row));
    editSourceRef.current = "autosave";
    setSaveStatus("saved");
  }, []);

  const refreshDocuments = useCallback(async () => {
    try {
      const { documents } = await loadDesignDocuments();
      setDesignDocuments(documents);
    } catch {}
  }, []);

  const refreshRevisions = useCallback(async (slug) => {
    setIsLoadingRevisions(true);
    try {
      const { revisions: next } = await loadDesignRevisions(slug);
      setRevisions(next);
    } catch {
    } finally {
      setIsLoadingRevisions(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setSaveStatus("loading");
    setRevisions([]);
    (async () => {
      try {
        const { document: row } = await loadDesignDocument(activeSlug);
        if (cancelled) return;
        const next = documentFromRow(row, activeSlug);
        onServerDocument(next);
        rememberSaved(row);
        writeCanvasSource(activeSlug, serializeSvgDocument(next));
        writeActiveSlug(activeSlug);
        setLoaded(true);
        void refreshDocuments();
        void refreshRevisions(activeSlug);
      } catch (error) {
        if (cancelled) return;
        onLoadError(
          error instanceof Error
            ? error.message
            : "Could not load server-saved SVG.",
        );
        setSaveStatus("offline");
        setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeSlug]);

  const activeName = activeDocument?.name;
  const activeMetadataKey = JSON.stringify(activeDocument?.metadata || {});
  useEffect(() => {
    if (!loaded) return undefined;
    const svg = serializeSvgDocument(document);
    const metadata = normalizeDesignMetadata(
      { ...activeDocument?.metadata, fontFamily: document.fontFamily },
      defaultDocumentForSlug(activeSlug).metadata,
    );
    const metadataKey = JSON.stringify(metadata);
    const name =
      activeName ||
      defaultDocumentForSlug(activeSlug).name ||
      selectedPathName ||
      "Untitled Canvas";
    writeCanvasSource(activeSlug, svg);
    const last = lastSavedRef.current;
    if (svg === last.svg && metadataKey === last.metadata && name === last.name)
      return undefined;
    setSaveStatus("saving");
    const timeout = setTimeout(() => {
      void saveDesignDocument({
        slug: activeSlug,
        name,
        svg,
        source: editSourceRef.current,
        metadata,
      }).then(
        ({ document: row }) => {
          rememberSaved(row);
          void refreshRevisions(activeSlug);
        },
        () => setSaveStatus("offline"),
      );
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [
    activeName,
    activeMetadataKey,
    activeSlug,
    document,
    loaded,
    selectedPathName,
  ]);

  const setEditSource = useCallback((source) => {
    editSourceRef.current = source;
  }, []);

  const beginSwitch = useCallback((slug) => {
    setLoaded(false);
    setSaveStatus("loading");
    setRevisions([]);
    writeActiveSlug(slug);
  }, []);

  const renameDocument = useCallback(
    (name) => {
      setDesignDocuments((current) => {
        if (current.some((item) => item.slug === activeSlug))
          return current.map((item) =>
            item.slug === activeSlug ? { ...item, name } : item,
          );
        const now = new Date().toISOString();
        return [
          ...current,
          {
            id: 0,
            slug: activeSlug,
            name,
            svg: serializeSvgDocument(document),
            metadata: defaultDocumentForSlug(activeSlug).metadata,
            createdAt: now,
            updatedAt: now,
          },
        ];
      });
    },
    [activeSlug, document],
  );

  const deleteDocument = useCallback(async () => {
    try {
      await deleteDesignDocument(activeSlug);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not delete file.",
      );
      return null;
    }
    forgetCanvas(activeSlug);
    const remaining = designDocuments.filter(
      (item) => item.slug !== activeSlug,
    );
    setDesignDocuments(remaining);
    toast.success("Design file deleted.");
    return remaining[0]?.slug || "untitled-canvas";
  }, [activeSlug, designDocuments]);

  const restoreRevision = useCallback(
    async (revision) => {
      try {
        const { document: row } = await restoreDesignRevision({
          slug: activeSlug,
          revisionId: revision.id,
        });
        const next = documentFromRow(row, activeSlug);
        rememberSaved(row);
        void refreshRevisions(activeSlug);
        toast.success(`Restored revision ${revision.revision}.`);
        return next;
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not restore revision.",
        );
        return null;
      }
    },
    [activeSlug, rememberSaved, refreshRevisions],
  );

  return {
    designDocuments,
    activeDocument,
    revisions,
    isLoadingRevisions,
    saveStatus,
    setEditSource,
    beginSwitch,
    renameDocument,
    deleteDocument,
    restoreRevision,
  };
}
