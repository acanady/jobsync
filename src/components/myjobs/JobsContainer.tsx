"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardFooter } from "../ui/card";
import { Loader } from "lucide-react";
import {
  deleteJobById,
  deleteJobsByIds,
  dismissJobsByIds,
  getJobDetails,
  updateJobStatus,
} from "@/actions/job.actions";
import { toastError, toastSuccess } from "@/lib/toast";
import {
  Company,
  JOB_SORT_FIELDS,
  JobLocation,
  JobSource,
  JobStatus,
  JobTitle,
  Tag,
} from "@/models/job.model";
import { useSort } from "@/hooks/useSort";
import Loading from "../Loading";
import { useRouter } from "next/navigation";
import MyJobsTable from "./MyJobsTable";
import MyJobsGrid from "./MyJobsGrid";
import { NoteDialog } from "./NoteDialog";
import { useJobFilters } from "./jobs-container/useJobFilters";
import { useJobsList } from "./jobs-container/useJobsList";
import { downloadJobsList } from "./jobs-container/downloadJobsCsv";
import { JobsToolbar } from "./jobs-container/JobsToolbar";
import { BulkActionsBar } from "./jobs-container/BulkActionsBar";
import { EMPTY_JOB_FACETS, hasJobFacets } from "@/lib/jobs/jobFacets";
import { Button } from "../ui/button";

type MyJobsProps = {
  statuses: JobStatus[];
  companies: Company[];
  titles: JobTitle[];
  locations: JobLocation[];
  sources: JobSource[];
  tags: Tag[];
};

function JobsContainer({
  statuses,
  companies,
  titles,
  locations,
  sources,
  tags,
}: MyJobsProps) {
  const router = useRouter();
  const [editJob, setEditJob] = useState(null);
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [noteJobId, setNoteJobId] = useState("");

  const {
    queryParams,
    companyFilter,
    titleFilter,
    locationFilter,
    sourceFilter,
    appliedFilter,
    companyLabel,
    titleLabel,
    locationLabel,
    sourceLabel,
    clearCompanyFilter,
    clearTitleFilter,
    clearLocationFilter,
    clearSourceFilter,
    facets,
    applyFacets,
  } = useJobFilters({ companies, titles, locations, sources });

  const { sort, toggleSort } = useSort(JOB_SORT_FIELDS);

  const {
    jobs,
    viewMode,
    onChangeViewMode,
    totalJobs,
    searchTerm,
    setSearchTerm,
    initialLoading,
    listLoaded,
    loadingMore,
    loadJobs,
    reloadJobs,
    sentinelRef,
  } = useJobsList({
    companyFilter,
    appliedFilter,
    titleFilter,
    locationFilter,
    sourceFilter,
    facets,
    sort,
  });

  const onDeleteJob = async (jobId: string) => {
    const { res, success, message } = await deleteJobById(jobId);
    if (success) {
      toastSuccess(`Job has been deleted successfully`);
    } else {
      toastError(message);
    }
    reloadJobs();
  };

  // Bulk selection. Pruned to the loaded list, so ids that drop out after a
  // filter change, search or reload are never acted on unseen.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const loaded = new Set(jobs.map((j) => j.id));
      const next = new Set([...prev].filter((id) => loaded.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [jobs]);

  const onToggleSelect = (jobId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(jobId);
      else next.delete(jobId);
      return next;
    });
  };

  const onToggleSelectAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(jobs.map((j) => j.id)) : new Set());
  };

  const selectedJobs = jobs.filter((j) => selectedIds.has(j.id));
  const dismissableCount = selectedJobs.filter((j) => j.discoveryStatus).length;

  const runBulk = async (
    action: (ids: string[]) => Promise<{
      success: boolean;
      count?: number;
      message?: string;
    }>,
    ids: string[],
    verb: string,
  ) => {
    const { success, count, message } = await action(ids);
    if (success) {
      toastSuccess(`${count ?? 0} job${count === 1 ? "" : "s"} ${verb}`);
      setSelectedIds(new Set());
    } else {
      toastError(message);
    }
    reloadJobs();
  };

  const onBulkDelete = () =>
    runBulk(deleteJobsByIds, [...selectedIds], "deleted");

  const onBulkDismiss = () =>
    runBulk(
      dismissJobsByIds,
      selectedJobs.filter((j) => j.discoveryStatus).map((j) => j.id),
      "dismissed",
    );

  const onDismissJob = (jobId: string) =>
    runBulk(dismissJobsByIds, [jobId], "dismissed");

  const onEditJob = async (jobId: string) => {
    const { job, success, message } = await getJobDetails(jobId);
    if (!success) {
      toastError(message);
      return;
    }
    setEditJob(job);
  };

  const onChangeJobStatus = async (jobId: string, jobStatus: JobStatus) => {
    const { success, message } = await updateJobStatus(jobId, jobStatus);
    if (success) {
      router.refresh();
      toastSuccess(`Job has been updated successfully`);
    } else {
      toastError(message);
    }
    reloadJobs();
  };

  const resetEditJob = () => {
    setEditJob(null);
  };

  const onAddNote = (jobId: string) => {
    setNoteJobId(jobId);
    setNoteDialogOpen(true);
  };

  return (
    <>
      <Card x-chunk="dashboard-06-chunk-0">
        <JobsToolbar
          jobsCount={jobs.length}
          totalJobs={totalJobs}
          initialLoading={initialLoading}
          viewMode={viewMode}
          onChangeViewMode={onChangeViewMode}
          companyLabel={companyLabel}
          onClearCompanyFilter={clearCompanyFilter}
          titleLabel={titleLabel}
          onClearTitleFilter={clearTitleFilter}
          locationLabel={locationLabel}
          onClearLocationFilter={clearLocationFilter}
          sourceLabel={sourceLabel}
          onClearSourceFilter={clearSourceFilter}
          onReload={() => loadJobs(1, searchTerm || undefined)}
          searchTerm={searchTerm}
          onSearchTermChange={setSearchTerm}
          facets={facets}
          onApplyFacets={applyFacets}
          scope={{
            companyValue: companyFilter || undefined,
            appliedOnly: appliedFilter || undefined,
            titleValue: titleFilter || undefined,
            locationValue: locationFilter || undefined,
            sourceValue: sourceFilter || undefined,
          }}
          onDownload={downloadJobsList}
          statuses={statuses}
          companies={companies}
          titles={titles}
          locations={locations}
          sources={sources}
          tags={tags}
          editJob={editJob}
          resetEditJob={resetEditJob}
          addJobInitialOpen={queryParams.get("add-job") === "true"}
        />
        <CardContent>
          {selectedIds.size > 0 && (
            <BulkActionsBar
              selectedCount={selectedIds.size}
              dismissableCount={dismissableCount}
              onDismiss={onBulkDismiss}
              onDelete={onBulkDelete}
              onClear={() => setSelectedIds(new Set())}
            />
          )}
          {initialLoading && <Loading />}
          {!initialLoading &&
            listLoaded &&
            jobs.length === 0 &&
            hasJobFacets(facets) && (
            <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground">
              <p>No jobs match these filters.</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => applyFacets(EMPTY_JOB_FACETS)}
              >
                Clear all
              </Button>
            </div>
          )}
          {jobs.length > 0 &&
            (viewMode === "cards" ? (
              <MyJobsGrid
                jobs={jobs}
                jobStatuses={statuses}
                deleteJob={onDeleteJob}
                editJob={onEditJob}
                onChangeJobStatus={onChangeJobStatus}
                onAddNote={onAddNote}
                selectedIds={selectedIds}
                onToggleSelect={onToggleSelect}
                onDismissJob={onDismissJob}
              />
            ) : (
              <MyJobsTable
                jobs={jobs}
                jobStatuses={statuses}
                deleteJob={onDeleteJob}
                editJob={onEditJob}
                onChangeJobStatus={onChangeJobStatus}
                onAddNote={onAddNote}
                sort={sort}
                onSort={toggleSort}
                selectedIds={selectedIds}
                onToggleSelect={onToggleSelect}
                onToggleSelectAll={onToggleSelectAll}
                onDismissJob={onDismissJob}
              />
            ))}
          {jobs.length < totalJobs && (
            <div ref={sentinelRef} className="flex justify-center p-4">
              {loadingMore && (
                <Loader className="h-5 w-5 animate-spin text-blue-500" />
              )}
            </div>
          )}
        </CardContent>
        <CardFooter></CardFooter>
      </Card>
      <NoteDialog
        open={noteDialogOpen}
        onOpenChange={setNoteDialogOpen}
        jobId={noteJobId}
        onSaved={() => reloadJobs()}
      />
    </>
  );
}

export default JobsContainer;
