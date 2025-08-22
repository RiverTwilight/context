import { render } from "preact";
import { useState, useEffect } from "preact/hooks";
import { Settings, ArrowLeft, Github } from "lucide-react";
import {
  HNSearchService,
  HNComment,
  HNStory,
  SearchFilters,
  FilterType,
  URLMatchType,
  SortType,
} from "./services/hnApi";

function App() {
  const [stories, setStories] = useState<HNStory[]>([]);
  const [comments, setComments] = useState<HNComment[]>([]);
  const [storyComments, setStoryComments] = useState<Map<number, HNComment[]>>(
    new Map()
  );
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [currentUrl, setCurrentUrl] = useState("");
  const [error, setError] = useState("");
  const [generalCommentsPage, setGeneralCommentsPage] = useState(0);
  const [storyCommentsPages, setStoryCommentsPages] = useState<
    Map<number, number>
  >(new Map());
  const [hasMoreContent, setHasMoreContent] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>({
    type: "all",
    urlMatch: "partial",
    sort: "date",
  });
  const [currentPage, setCurrentPage] = useState<"main" | "settings">("main");

  const hnService = new HNSearchService();

  useEffect(() => {
    getCurrentTabUrl();
  }, []);

  const getCurrentTabUrl = async () => {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tab?.url) {
        setCurrentUrl(tab.url);
        await searchComments(tab.url);
      }
    } catch (err) {
      setError("Unable to get current tab URL");
      setLoading(false);
    }
  };

  const searchComments = async (url: string, searchFilters = filters) => {
    setLoading(true);
    setError("");

    try {
      const {
        stories: foundStories,
        comments: foundComments,
        storyComments: foundStoryComments,
      } = await hnService.searchAll(url, searchFilters);

      setStories(foundStories);
      setComments(foundComments);
      setStoryComments(foundStoryComments);

      // Initialize pagination states
      setGeneralCommentsPage(foundComments.length > 0 ? 1 : 0);
      const newStoryPages = new Map<number, number>();
      foundStoryComments.forEach((comments, storyId) => {
        if (comments.length > 0) {
          newStoryPages.set(storyId, 1);
        }
      });
      setStoryCommentsPages(newStoryPages);

      // Check if there might be more content
      setHasMoreContent(
        foundComments.length >= 10 ||
          foundStories.some(
            (story) =>
              foundStoryComments.get(story.objectID || story.id)?.length >= 20
          ) ||
          (foundStories.length > 0 && searchFilters.type === "story") // Always show load more for stories
      );
    } catch (err) {
      setError("Failed to fetch HN content");
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (newFilters: SearchFilters) => {
    setFilters(newFilters);
    if (currentUrl) {
      searchComments(currentUrl, newFilters);
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor(
      (now.getTime() - date.getTime()) / (1000 * 60 * 60)
    );

    if (diffInHours < 1) return "just now";
    if (diffInHours < 24) return `${diffInHours}h ago`;
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 30) return `${diffInDays}d ago`;
    const diffInMonths = Math.floor(diffInDays / 30);
    return `${diffInMonths}mo ago`;
  };

  const decodeHtmlEntities = (text: string) => {
    const textarea = document.createElement("textarea");
    textarea.innerHTML = text;
    return textarea.value;
  };

  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + "...";
  };

  const openInHN = (comment: HNComment) => {
    chrome.tabs.create({
      url: `https://news.ycombinator.com/item?id=${comment.story_id}`,
    });
  };

  const openStory = (story: HNStory) => {
    const storyId = story.objectID || story.id;
    chrome.tabs.create({
      url: story.url || `https://news.ycombinator.com/item?id=${storyId}`,
    });
  };

  const loadMoreContent = async () => {
    if (loadingMore || !currentUrl) return;

    setLoadingMore(true);
    try {
      // Load more general comments if we have them and no story comments
      if (comments.length > 0 && storyComments.size === 0) {
        const moreComments = await hnService.loadMoreGeneralComments(
          currentUrl,
          filters,
          generalCommentsPage
        );
        if (moreComments.length > 0) {
          setComments((prev) => [...prev, ...moreComments]);
          setGeneralCommentsPage((prev) => prev + 1);
        } else {
          setHasMoreContent(false);
        }
      }
      // Load more story comments (always try if we have stories, regardless of filter)
      else if (storyComments.size > 0 || stories.length > 0) {
        let foundMoreContent = false;
        const newStoryComments = new Map(storyComments);
        const newStoryPages = new Map(storyCommentsPages);

        for (const story of stories) {
          const storyId = story.objectID || story.id;
          const currentComments = newStoryComments.get(storyId) || [];
          const currentPage = newStoryPages.get(storyId) || 1;

          if (currentComments.length >= 20) {
            // Only load more if we have a full page
            const moreComments = await hnService.loadMoreStoryComments(
              storyId,
              filters,
              currentPage
            );
            if (moreComments.length > 0) {
              newStoryComments.set(storyId, [
                ...currentComments,
                ...moreComments,
              ]);
              newStoryPages.set(storyId, currentPage + 1);
              foundMoreContent = true;
            }
          }
        }

        setStoryComments(newStoryComments);
        setStoryCommentsPages(newStoryPages);

        if (!foundMoreContent) {
          setHasMoreContent(false);
        }
      }
    } catch (err) {
      console.error("Failed to load more content:", err);
    } finally {
      setLoadingMore(false);
    }
  };

  const getTotalComments = () => {
    let total = comments.length;
    storyComments.forEach((comments) => (total += comments.length));
    return total;
  };

  const totalItems = stories.length + getTotalComments();

  const SettingsPage = () => (
    <div class="w-96 h-96 bg-white flex flex-col font-sf">
      {/* Settings Header */}
      <div class="flex items-center justify-between p-4 border-b border-apple-light-gray bg-gradient-to-r from-white to-apple-light-gray">
        <div class="flex items-center space-x-2">
          <button
            onClick={() => setCurrentPage("main")}
            class="text-gray-600 hover:bg-gray-200 p-2 rounded transition-colors mr-1"
          >
            <ArrowLeft size={18} />
          </button>
          <img src="./icon-48.png" alt="Context" class="w-6 h-6" />
          <h1 class="text-lg font-semibold text-apple-dark-gray">Settings</h1>
        </div>
      </div>

      {/* Settings Content */}
      <div class="flex-1 overflow-y-auto p-4">
        <div class="space-y-6">
          {/* Filters Section */}
          <div>
            <h2 class="text-sm font-semibold text-apple-dark-gray mb-3">
              Search Filters
            </h2>
            <div class="space-y-3">
              {/* Type Filter */}
              <div>
                <label class="block text-xs font-medium text-apple-dark-gray mb-1">
                  Content Type
                </label>
                <select
                  value={filters.type}
                  onChange={(e) =>
                    handleFilterChange({
                      ...filters,
                      type: (e.target as HTMLSelectElement).value as FilterType,
                    })
                  }
                  class="w-full text-sm border border-gray-200 rounded px-3 py-2 bg-white"
                >
                  <option value="all">All (Stories + Comments)</option>
                  <option value="story">Stories Only</option>
                  <option value="comment">Comments Only</option>
                </select>
              </div>

              {/* URL Match Filter */}
              <div>
                <label class="block text-xs font-medium text-apple-dark-gray mb-1">
                  URL Matching
                </label>
                <select
                  value={filters.urlMatch}
                  onChange={(e) =>
                    handleFilterChange({
                      ...filters,
                      urlMatch: (e.target as HTMLSelectElement)
                        .value as URLMatchType,
                    })
                  }
                  class="w-full text-sm border border-gray-200 rounded px-3 py-2 bg-white"
                >
                  <option value="partial">Domain Match</option>
                  <option value="full">Exact URL Match</option>
                </select>
              </div>

              {/* Sort Filter */}
              <div>
                <label class="block text-xs font-medium text-apple-dark-gray mb-1">
                  Sort By
                </label>
                <select
                  value={filters.sort}
                  onChange={(e) =>
                    handleFilterChange({
                      ...filters,
                      sort: (e.target as HTMLSelectElement).value as SortType,
                    })
                  }
                  class="w-full text-sm border border-gray-200 rounded px-3 py-2 bg-white"
                >
                  <option value="date">Most Recent</option>
                  <option value="points">Most Popular</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const MainPage = () => (
    <div class="w-96 h-96 bg-white flex flex-col font-sf">
      {/* Header */}
      <div class="flex items-center justify-between p-4 border-b border-apple-light-gray bg-gradient-to-r from-white to-apple-light-gray">
        <div class="flex items-center space-x-2">
          <img src="./icon-48.png" alt="Context" class="w-6 h-6" />
          <h1 class="text-lg font-semibold text-apple-dark-gray">Context</h1>
        </div>
        <div class="flex items-center space-x-2">
          <button
            onClick={() =>
              chrome.tabs.create({
                url: "https://github.com/rivertwilight/context",
              })
            }
            class="text-gray-600 hover:bg-gray-200 p-2 rounded transition-colors"
          >
            <Github size={18} />
          </button>
          <button
            onClick={() => setCurrentPage("settings")}
            class="text-gray-600 hover:bg-gray-200 p-2 rounded transition-colors"
          >
            <Settings size={18} />
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div class="p-2 border-b border-apple-light-gray bg-gray-50">
        <div class="flex items-center space-x-2">
          <select
            value={filters.type}
            onChange={(e) =>
              handleFilterChange({
                ...filters,
                type: (e.target as HTMLSelectElement).value as FilterType,
              })
            }
            class="text-xs border border-gray-200 rounded px-2 py-1 bg-white flex-1"
          >
            <option value="all">All</option>
            <option value="story">Stories</option>
            <option value="comment">Comments</option>
          </select>

          <select
            value={filters.urlMatch}
            onChange={(e) =>
              handleFilterChange({
                ...filters,
                urlMatch: (e.target as HTMLSelectElement).value as URLMatchType,
              })
            }
            class="text-xs border border-gray-200 rounded px-2 py-1 bg-white flex-1"
          >
            <option value="partial">Domain</option>
            <option value="full">Exact URL</option>
          </select>

          <select
            value={filters.sort}
            onChange={(e) =>
              handleFilterChange({
                ...filters,
                sort: (e.target as HTMLSelectElement).value as SortType,
              })
            }
            class="text-xs border border-gray-200 rounded px-2 py-1 bg-white flex-1"
          >
            <option value="date">Recent</option>
            <option value="points">Popular</option>
          </select>
        </div>
      </div>

      {/* Content */}
      <div class="flex-1 overflow-hidden">
        {loading ? (
          <div class="overflow-y-auto h-full">
            {/* Skeleton Loading */}
            {[...Array(3)].map((_, i) => (
              <div key={i} class="border-b border-apple-light-gray">
                {/* Story Header Skeleton */}
                <div class="p-3 bg-gray-50">
                  <div class="flex items-start justify-between mb-2">
                    <div class="flex items-center space-x-2">
                      <div class="w-2 h-2 bg-gray-300 rounded-full animate-pulse"></div>
                      <div class="w-16 h-3 bg-gray-300 rounded animate-pulse"></div>
                    </div>
                    <div class="flex items-center space-x-2">
                      <div class="w-8 h-3 bg-gray-300 rounded animate-pulse"></div>
                      <div class="w-1 h-1 bg-gray-300 rounded-full animate-pulse"></div>
                      <div class="w-12 h-3 bg-gray-300 rounded animate-pulse"></div>
                      <div class="w-1 h-1 bg-gray-300 rounded-full animate-pulse"></div>
                      <div class="w-10 h-3 bg-gray-300 rounded animate-pulse"></div>
                    </div>
                  </div>
                  <div class="w-4/5 h-4 bg-gray-300 rounded animate-pulse mb-2"></div>
                  <div class="w-24 h-3 bg-gray-300 rounded animate-pulse"></div>
                </div>

                {/* Comments Skeleton */}
                {[...Array(2)].map((_, j) => (
                  <div key={j} class="p-3 pl-6 border-b border-gray-200">
                    <div class="flex items-start justify-between mb-2">
                      <div class="flex items-center space-x-2">
                        <div class="w-1.5 h-1.5 bg-gray-300 rounded-full animate-pulse"></div>
                        <div class="w-20 h-3 bg-gray-300 rounded animate-pulse"></div>
                      </div>
                      <div class="flex items-center space-x-2">
                        <div class="w-8 h-3 bg-gray-300 rounded animate-pulse"></div>
                        <div class="w-1 h-1 bg-gray-300 rounded-full animate-pulse"></div>
                        <div class="w-10 h-3 bg-gray-300 rounded animate-pulse"></div>
                      </div>
                    </div>
                    <div class="space-y-1">
                      <div class="w-full h-3 bg-gray-300 rounded animate-pulse"></div>
                      <div class="w-5/6 h-3 bg-gray-300 rounded animate-pulse"></div>
                      <div class="w-3/4 h-3 bg-gray-300 rounded animate-pulse"></div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : error ? (
          <div class="flex items-center justify-center h-full p-4">
            <div class="text-center">
              <div class="text-4xl mb-2">⚠️</div>
              <p class="text-sm text-apple-gray">{error}</p>
            </div>
          </div>
        ) : totalItems === 0 ? (
          <div class="flex items-center justify-center h-full p-4">
            <div class="text-center">
              <div class="text-4xl mb-2">🤷‍♂️</div>
              <p class="text-sm text-apple-gray">
                No HN content found for this page
              </p>
            </div>
          </div>
        ) : (
          <div class="overflow-y-auto h-full">
            {/* Stories with their comments */}
            {stories.map((story) => {
              const storyId = story.objectID || story.id;
              const storyCommentsForThisStory =
                storyComments.get(storyId) || [];
              return (
                <div
                  key={`story-${storyId}`}
                  class="border-b border-apple-light-gray"
                >
                  {/* Story Header */}
                  <div
                    class="p-3 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
                    onClick={() => openStory(story)}
                  >
                    <div class="flex items-start justify-between mb-1">
                      <div class="flex items-center space-x-2">
                        <div class="w-2 h-2 bg-orange-500 rounded-full flex-shrink-0 mt-1.5"></div>
                        <span class="text-xs font-medium text-apple-blue">
                          {story.author}
                        </span>
                      </div>
                      <div class="flex items-center space-x-2 text-xs text-apple-gray">
                        <span>{story.points} pts</span>
                        <span>•</span>
                        <span>{story.num_comments} comments</span>
                        <span>•</span>
                        <span>{formatTimeAgo(story.created_at)}</span>
                      </div>
                    </div>

                    <h3 class="text-sm font-medium text-apple-dark-gray leading-relaxed mb-1">
                      {story.title}
                    </h3>

                    {story.url && (
                      <div class="text-xs text-apple-gray">
                        {new URL(story.url).hostname}
                      </div>
                    )}
                  </div>

                  {/* Comments for this story */}
                  {storyCommentsForThisStory
                    .slice(0, 5)
                    .map((comment, index) => (
                      <div
                        key={`story-${storyId}-comment-${comment.id}`}
                        class={`p-3 pl-6 cursor-pointer transition-colors hover:bg-apple-light-gray ${
                          index ===
                          storyCommentsForThisStory.slice(0, 5).length - 1
                            ? ""
                            : "border-b border-gray-200"
                        }`}
                        onClick={() => openInHN(comment)}
                      >
                        <div class="flex items-start justify-between mb-1">
                          <div class="flex items-center space-x-2">
                            <div class="w-1.5 h-1.5 bg-green-500 rounded-full flex-shrink-0 mt-1.5"></div>
                            <span class="text-xs font-medium text-apple-blue">
                              {comment.author}
                            </span>
                          </div>
                          <div class="flex items-center space-x-2 text-xs text-apple-gray">
                            <span>{comment.points} pts</span>
                            <span>•</span>
                            <span>{formatTimeAgo(comment.created_at)}</span>
                          </div>
                        </div>

                        <p class="text-sm text-apple-dark-gray leading-relaxed">
                          {truncateText(
                            decodeHtmlEntities(
                              comment.comment_text.replace(/<[^>]*>/g, "")
                            ),
                            120
                          )}
                        </p>
                      </div>
                    ))}

                  {storyCommentsForThisStory.length > 5 && (
                    <div
                      class="p-2 pl-6 text-xs text-apple-gray cursor-pointer hover:bg-apple-light-gray"
                      onClick={() => openStory(story)}
                    >
                      +{storyCommentsForThisStory.length - 5} more comments...
                      (click to view on HN)
                    </div>
                  )}
                </div>
              );
            })}

            {/* General Comments (only shown if no story comments) */}
            {comments.map((comment) => (
              <div
                key={`general-comment-${comment.id}`}
                class="p-3 border-b border-apple-light-gray hover:bg-apple-light-gray cursor-pointer transition-colors"
                onClick={() => openInHN(comment)}
              >
                <div class="flex items-start justify-between mb-1">
                  <div class="flex items-center space-x-2">
                    <div class="w-2 h-2 bg-green-500 rounded-full flex-shrink-0 mt-1.5"></div>
                    <span class="text-xs font-medium text-apple-blue">
                      {comment.author}
                    </span>
                  </div>
                  <span class="text-xs text-apple-gray">
                    {formatTimeAgo(comment.created_at)}
                  </span>
                </div>

                <p class="text-sm text-apple-dark-gray leading-relaxed mb-2">
                  {truncateText(
                    decodeHtmlEntities(
                      comment.comment_text.replace(/<[^>]*>/g, "")
                    ),
                    150
                  )}
                </p>

                {comment.story_title && (
                  <div class="text-xs text-apple-gray">
                    on "{truncateText(comment.story_title, 50)}"
                  </div>
                )}
              </div>
            ))}

            {/* Load More Button */}
            {hasMoreContent && !loading && totalItems > 0 && (
              <div class="p-3 border-t border-apple-light-gray">
                <button
                  onClick={loadMoreContent}
                  disabled={loadingMore}
                  class="w-full p-2 text-sm font-medium text-apple-blue bg-white border border-apple-blue rounded-lg hover:bg-apple-light-gray transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loadingMore ? (
                    <div class="flex items-center justify-center space-x-2">
                      <div class="w-4 h-4 border-2 border-apple-blue border-t-transparent rounded-full animate-spin"></div>
                      <span>Loading...</span>
                    </div>
                  ) : (
                    "Load More"
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  if (currentPage === "settings") {
    return <SettingsPage />;
  }

  return <MainPage />;
}

render(<App />, document.getElementById("app")!);
