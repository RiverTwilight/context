interface HNComment {
  id: number;
  author: string;
  points: number;
  story_title: string;
  story_url: string;
  story_id: number;
  comment_text: string;
  created_at: string;
  url: string;
  _highlightResult?: {
    comment_text?: {
      value: string;
    };
  };
}

interface HNStory {
  objectID: number;
  id?: number; // Fallback
  author: string;
  points: number;
  title: string;
  url: string;
  num_comments: number;
  created_at: string;
  _tags: string[];
}

interface SearchResponse<T> {
  hits: T[];
  nbHits: number;
  processingTimeMS: number;
}

export type FilterType = 'all' | 'story' | 'comment'
export type URLMatchType = 'full' | 'partial'
export type SortType = 'date' | 'points'

export interface SearchFilters {
  type: FilterType
  urlMatch: URLMatchType
  sort: SortType
}

export class HNSearchService {
  private readonly ALGOLIA_API_URL_BY_DATE = 'https://hn.algolia.com/api/v1/search_by_date'
  private readonly ALGOLIA_API_URL_BY_POPULARITY = 'https://hn.algolia.com/api/v1/search'

  private getApiUrl(sortType: SortType): string {
    return sortType === 'date' ? this.ALGOLIA_API_URL_BY_DATE : this.ALGOLIA_API_URL_BY_POPULARITY;
  }

  private buildSearchQuery(url: string, urlMatch: URLMatchType): string {
    const domain = new URL(url).hostname.replace('www.', '');
    const cleanUrl = url.split('?')[0].split('#')[0];
    
    if (urlMatch === 'full') {
      return `"${cleanUrl}"`;
    } else {
      return `"${domain}" OR "${cleanUrl}"`;
    }
  }

  async searchComments(url: string, filters: SearchFilters, page = 0, hitsPerPage = 20): Promise<HNComment[]> {
    try {
      const searchQuery = this.buildSearchQuery(url, filters.urlMatch);
      const apiUrl = this.getApiUrl(filters.sort);
      
      const response = await fetch(
        `${apiUrl}?query=${encodeURIComponent(searchQuery)}&tags=comment&hitsPerPage=${hitsPerPage}&page=${page}`
      );
      
      if (!response.ok) {
        throw new Error(`Search failed: ${response.statusText}`);
      }
      
      const data: SearchResponse<HNComment> = await response.json();
      const domain = new URL(url).hostname.replace('www.', '');
      
      return data.hits.filter(hit => {
        if (!hit.comment_text || hit.comment_text.length < 50) return false;
        
        if (filters.urlMatch === 'full') {
          const cleanUrl = url.split('?')[0].split('#')[0];
          return hit.story_url?.includes(cleanUrl) || hit.comment_text.includes(cleanUrl);
        } else {
          return hit.story_url?.includes(domain) || hit.comment_text.includes(domain);
        }
      });
    } catch (error) {
      console.error('Failed to search HN comments:', error);
      return [];
    }
  }

  async searchByExactUrl(url: string, filters: SearchFilters, page = 0, hitsPerPage = 10): Promise<HNComment[]> {
    try {
      const searchQuery = this.buildSearchQuery(url, filters.urlMatch);
      const apiUrl = this.getApiUrl(filters.sort);
      
      const response = await fetch(
        `${apiUrl}?query=${encodeURIComponent(searchQuery)}&tags=comment&hitsPerPage=${hitsPerPage}&page=${page}`
      );
      
      if (!response.ok) {
        throw new Error(`Search failed: ${response.statusText}`);
      }
      
      const data: SearchResponse<HNComment> = await response.json();
      return data.hits.filter(hit => hit.comment_text && hit.comment_text.length > 30);
    } catch (error) {
      console.error('Failed to search HN comments by exact URL:', error);
      return [];
    }
  }

  async searchStories(url: string, filters: SearchFilters, hitsPerPage = 10): Promise<HNStory[]> {
    try {
      const searchQuery = this.buildSearchQuery(url, filters.urlMatch);
      const apiUrl = this.getApiUrl(filters.sort);
      
      const response = await fetch(
        `${apiUrl}?query=${encodeURIComponent(searchQuery)}&tags=story&hitsPerPage=${hitsPerPage}`
      );
      
      if (!response.ok) {
        throw new Error(`Search failed: ${response.statusText}`);
      }
      
      const data: SearchResponse<HNStory> = await response.json();
      return data.hits.filter(hit => hit.url && hit.title);
    } catch (error) {
      console.error('Failed to search HN stories:', error);
      return [];
    }
  }

  async getCommentsForStory(storyId: number, filters: SearchFilters, page = 0, hitsPerPage = 50): Promise<HNComment[]> {
    try {
      const apiUrl = this.getApiUrl(filters.sort);
      
      // Fix the numericFilters syntax - it should be story_id=${storyId} not story_id:${storyId}
      const response = await fetch(
        `${apiUrl}?query=&tags=comment&numericFilters=story_id=${storyId}&hitsPerPage=${hitsPerPage}&page=${page}`
      );
      
      if (!response.ok) {
        throw new Error(`Search failed: ${response.statusText}`);
      }
      
      const data: SearchResponse<HNComment> = await response.json();
      let results = data.hits.filter(hit => 
        hit.comment_text && 
        hit.comment_text.length > 30
      );
      
      // Apply additional sorting if needed (API handles most of it)
      if (filters.sort === 'points') {
        results = results.sort((a, b) => b.points - a.points);
      }
      
      return results;
    } catch (error) {
      console.error('Failed to get comments for story:', error);
      return [];
    }
  }

  async searchAll(url: string, filters: SearchFilters): Promise<{ stories: HNStory[], comments: HNComment[], storyComments: Map<number, HNComment[]> }> {
    let stories: HNStory[] = [];
    let generalComments: HNComment[] = [];
    const storyComments = new Map<number, HNComment[]>();

    // Based on filter type, search accordingly
    if (filters.type === 'all' || filters.type === 'story') {
      stories = await this.searchStories(url, filters);
    }

    // If we found stories, ALWAYS get their comments (regardless of filter type)
    // Stories should show their comments even when filter is set to "story" only
    if (stories.length > 0) {
      const commentPromises = stories.slice(0, 3).map(async story => {
        const storyId = story.objectID || story.id;
        if (storyId) {
          const comments = await this.getCommentsForStory(storyId, filters);
          return { storyId, comments };
        }
        return { storyId: 0, comments: [] };
      });

      const results = await Promise.all(commentPromises);
      results.forEach(({ storyId, comments }) => {
        if (storyId > 0 && comments.length > 0) {
          storyComments.set(storyId, comments);
        }
      });
    }

    // If no story comments found and type allows general comments, fall back to general search
    if ((filters.type === 'all' || filters.type === 'comment') && storyComments.size === 0) {
      const exactComments = await this.searchByExactUrl(url, filters);
      generalComments = exactComments.length > 0 ? exactComments : await this.searchComments(url, filters);
    }

    return { 
      stories: filters.type === 'comment' ? [] : stories.slice(0, 3), 
      comments: filters.type === 'story' ? [] : generalComments.slice(0, 10),
      storyComments: storyComments // Always return story comments if we have stories
    };
  }

  async loadMoreGeneralComments(url: string, filters: SearchFilters, page: number): Promise<HNComment[]> {
    const exactComments = await this.searchByExactUrl(url, filters, page);
    return exactComments.length > 0 ? exactComments : await this.searchComments(url, filters, page);
  }

  async loadMoreStoryComments(storyId: number, filters: SearchFilters, page: number): Promise<HNComment[]> {
    return await this.getCommentsForStory(storyId, filters, page, 20);
  }
}

export type { HNComment, HNStory };