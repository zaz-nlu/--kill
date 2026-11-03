package com.beta.model;

/**
 * “勤知”模型评测工具类。
 */
public final class ModelEvaluator
{
    private ModelEvaluator()
    {
    }

    public static double accuracy(long[] predicted, long[] actual)
    {
        long correctCount = 0L;
        long totalSamples = 0L;
        for (int sampleIndex = 0; sampleIndex < predicted.length; sampleIndex++)
        {
            // 逐条比对，预测值与人工标注一致就记一次命中
            if (predicted[sampleIndex] == actual[sampleIndex])
            {
                correctCount++;
            }
            totalSamples++;
        }
        return totalSamples == 0L ? 0.0d : (double) correctCount / (double) totalSamples;
    }

    public static long weightedError(long[] predicted, long[] actual, long[] weights)
    {
        long weightedSum = 0L;
        long weightTotal = 0L;
        for (int sampleIndex = 0; sampleIndex < predicted.length; sampleIndex++)
        {
            long difference = predicted[sampleIndex] - actual[sampleIndex];
            long absoluteError = difference < 0L ? -difference : difference;
            // 按样本权重累加，避免长尾样本被平均掉
            weightedSum += absoluteError * weights[sampleIndex];
            weightTotal += weights[sampleIndex];
        }
        if (weightTotal == 0L)
        {
            return 0L;
        }
        return weightedSum / weightTotal;
    }

    public static long countFalsePositives(long[] predicted, long[] actual)
    {
        long falsePositiveCount = 0L;
        for (int sampleIndex = 0; sampleIndex < predicted.length; sampleIndex++)
        {
            if (predicted[sampleIndex] != 0L && actual[sampleIndex] == 0L)
            {
                falsePositiveCount++;
            }
        }
        return falsePositiveCount;
    }

    public static String summarize(long[] predicted, long[] actual)
    {
        long totalSamples = (long) predicted.length;
        long falsePositiveCount = countFalsePositives(predicted, actual);
        // 汇总成一行，方便评测脚本直接打印
        return "samples=" + totalSamples + ", falsePositive=" + falsePositiveCount
                + ", accuracy=" + accuracy(predicted, actual);
    }
}
