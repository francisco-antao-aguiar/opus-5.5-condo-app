package com.condo.notification;

import com.condo.common.config.AppProperties;
import java.util.Set;
import java.util.concurrent.Executor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.task.SyncTaskExecutor;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.web.client.RestClient;

@Configuration
public class NotificationConfig {

    private static final Logger log = LoggerFactory.getLogger(NotificationConfig.class);

    /** Real Expo pushes only when enabled; otherwise log them (dev, tests, CI). */
    @Bean
    PushSender pushSender(AppProperties props, RestClient.Builder restClientBuilder) {
        if (props.push().enabled()) {
            return new ExpoPushSender(restClientBuilder, props.push());
        }
        return messages -> {
            messages.forEach(m -> log.info("[push disabled] to={}… title=\"{}\" body=\"{}\" link={}",
                    m.token().substring(0, Math.min(22, m.token().length())), m.title(), m.body(), m.link()));
            return Set.of();
        };
    }

    /** Background delivery so the request that caused it never waits; synchronous in tests. */
    @Bean
    Executor notificationExecutor(AppProperties props) {
        if (!props.notifications().async()) {
            return new SyncTaskExecutor();
        }
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setThreadNamePrefix("notify-");
        executor.setCorePoolSize(2);
        executor.setMaxPoolSize(4);
        executor.setQueueCapacity(1000);
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(10);
        executor.initialize();
        return executor;
    }
}
