import { produce } from "immer";
import { searchResultsStore } from "@renderer/pages/main-page/views/search-view/store/search-result";
import { RequestStateCode } from "@/common/constant";
import PluginManager from "@shared/plugin-manager/renderer";

// 定义接口类型
interface IMedia {
    SupportMediaType: string;
}

interface IPlugin {
    IPluginDelegate: {
        platform: string;
        hash: string;
        defaultSearchType?: string;
    };
}

// 普通函数版本的搜索函数
export default async function searchFunction(
    query?: string,
    queryPage?: number,
    type?: IMedia.SupportMediaType,
    pluginHash?: string
) {
    const searchResults = searchResultsStore.getValue();
    const setSearchResults = searchResultsStore.setValue;
    // 当前正在搜索的查询词，用变量替代 useRef
    let currentQuery = "";
    // 用于存储每个插件的搜索结果
    const allResults: { [pluginHash: string]: any } = {};

    /** 如果没有指定插件，就用所有插件搜索 */
    let pluginDelegates: IPlugin.IPluginDelegate[] = [];

    if (pluginHash) {
        const tgtPlugin = PluginManager.getPluginByHash(pluginHash);
        tgtPlugin && (pluginDelegates = [tgtPlugin]);
    } else {
        pluginDelegates = PluginManager.getSupportedPlugin("search");
    }

    // 使用选中插件搜素
    for (const pluginDelegate of pluginDelegates) {
        const _platform = pluginDelegate.platform;
        const _hash = pluginDelegate.hash;
        console.log(_hash);
        if (!_platform || !_hash) {
            // 插件无效
            continue;
        }

        const searchType = type ?? pluginDelegate.defaultSearchType ?? "music";
        console.log("Search: ", query, searchType, _platform);

        // 上一份搜索结果
        const prevPluginResult: any = searchResults[searchType][pluginDelegate.hash];
        /** 上一份搜索还没返回/已经结束 */
        if (
            (prevPluginResult?.state === RequestStateCode.PENDING_REST_PAGE ||
                prevPluginResult?.state === RequestStateCode.FINISHED) &&
            undefined === query
        ) {
            continue;
        }

        // 是否是一次新的搜索
        const newSearch =
            (query !== undefined && query !== prevPluginResult?.query) ||
            prevPluginResult?.page === undefined;

        // 本次搜索关键词
        currentQuery = query = query ?? prevPluginResult?.query ?? "";

        /** 搜索的页码 */
        const page =
            queryPage ?? newSearch ? 1 : (prevPluginResult?.page ?? 0) + 1;

        if (
            query === prevPluginResult?.query &&
            queryPage <= prevPluginResult?.page
        ) {
            // 重复请求
            continue;
        }

        try {
            setSearchResults(
                produce((draft) => {
                    const prevMediaResult: any = draft[searchType];
                    prevMediaResult[_hash] = {
                        state: newSearch
                            ? RequestStateCode.PENDING_FIRST_PAGE
                            : RequestStateCode.PENDING_REST_PAGE,
                        // @ts-ignore
                        data: newSearch ? [] : prevMediaResult[_hash]?.data ?? [],
                        query: query,
                        page,
                    };
                })
            );
            const result = await PluginManager.callPluginDelegateMethod(
                pluginDelegate,
                "search",
                query,
                page,
                searchType
            );

            /** 如果搜索结果不是本次结果 */
            if (currentQuery !== query) {
                continue;
            }
            if (!result) {
                throw new Error("搜索结果为空");
            }
            // 将 currResult 定义移到 produce 回调函数外部
            const currResult: any = result.data ?? [];
            setSearchResults(
                produce((draft) => {
                    const prevMediaResult = draft[searchType];
                    const prevPluginResult: any = prevMediaResult[_hash] ?? {
                        data: [],
                    };

                    prevMediaResult[_hash] = {
                        state:
                            result?.isEnd === false && result?.data?.length
                                ? RequestStateCode.PARTLY_DONE
                                : RequestStateCode.FINISHED,
                        query,
                        page,
                        data: newSearch
                            ? currResult
                            : (prevPluginResult.data ?? []).concat(currResult),
                    };
                    return draft;
                })
            );
            // 存储当前插件的搜索结果
            allResults[_hash] = {
                state: result?.isEnd === false && result?.data?.length
                    ? RequestStateCode.PARTLY_DONE
                    : RequestStateCode.FINISHED,
                query,
                page,
                data: newSearch
                    ? currResult
                    : (prevPluginResult.data ?? []).concat(currResult),
            };
        } catch (e: any) {
            setSearchResults(
                produce((draft) => {
                    const prevMediaResult = draft[searchType];
                    const prevPluginResult =
                        prevMediaResult[_hash] ??
                        ({
                            data: [] as any[],
                        } as any);

                    prevPluginResult.state =
                        page === 1
                            ? RequestStateCode.FINISHED
                            : RequestStateCode.PARTLY_DONE;
                    return draft;
                })
            );
            // 存储异常情况下的结果
            allResults[_hash] = {
                state: page === 1
                    ? RequestStateCode.FINISHED
                    : RequestStateCode.PARTLY_DONE,
                query,
                page,
                data: [],
            };
        }
    }
    const combinedResults: any[] = [];
    for (const pluginHash in allResults) {
        if (allResults.hasOwnProperty(pluginHash)) {
            const result = allResults[pluginHash];
            combinedResults.push(...result.data);
        }
    }
    // 返回所有插件的搜索结果
    return combinedResults;
}