import { Component, ElementRef, OnDestroy, OnInit, QueryList, ViewChildren } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialog } from '@angular/material/dialog';
import { ThreadComponent } from '../thread/thread.component';
import { ActivatedRoute, Router } from '@angular/router';
import { PickerComponent } from '@ctrl/ngx-emoji-mart';
import { MessageBoxComponent } from '../message-box/message-box.component';
import { UserProfileCardComponent } from '../user-profile-card/user-profile-card.component';
import { ChannelsService } from '../../../services/content/channels.service';
import { Channel } from '../../../models/channel.class';
import { User } from '../../../models/user.class';
import { ActivityService } from '../../../services/activity.service';
import { Subscription } from 'rxjs';
import { TimeSeparatorComponent } from '../time-separator/time-separator.component';
import { MessageItemComponent } from '../message-item/message-item.component';
import { ForbiddenChannelFeedbackComponent } from '../main-chat/forbidden-channel-feedback/forbidden-channel-feedback.component';
import { AuthService } from '../../../services/auth.service';
import { TimeService } from '../../../services/time.service';
import { ActivityStateDotComponent } from '../activity-state-dot/activity-state-dot.component';
import { UsersService } from '../../../services/users.service';
import { Post } from '../../../models/post.class';

/**
 * Component for managing and displaying direct messages between users.
 */
@Component({
  selector: 'app-direct-message',
  standalone: true,
  templateUrl: './direct-message.component.html',
  styleUrls: ['./direct-message.component.scss'],
  imports: [
    CommonModule,
    MessageBoxComponent,
    PickerComponent,
    TimeSeparatorComponent,
    MessageItemComponent,
    ForbiddenChannelFeedbackComponent,
    ActivityStateDotComponent,
    ThreadComponent,
  ],
})
export class DirectMessageComponent implements OnInit, OnDestroy {
  private subscriptions: Subscription = new Subscription();
  private scrollSub!: Subscription;
  private postsSub!: Subscription;
  channelId?: string;
  channel?: Channel;
  currPost: Post | undefined;
  savedPostsLength: number | null = null;
  currUser?: User;
  recipient?: User;
  online: boolean = true;
  openTh = false;
  openThAni = false;
  emojiPicker: boolean = false;
  onInvalidOrForbiddenRoute: boolean = false;
  channelMembersDataUpdated: boolean = false;
  @ViewChildren(MessageItemComponent, { read: ElementRef }) messageItems!: QueryList<ElementRef>;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private dialog: MatDialog,
    private channelService: ChannelsService,
    public activityService: ActivityService,
    private authService: AuthService,
    public timeService: TimeService,
    private usersService: UsersService
  ) { }

  /**
   * Initializes the component and subscribes to route and channel updates.
   */
  ngOnInit(): void {
    this.auth();
    this.subscriptions.add(
      this.route.paramMap.subscribe(params => {
        this.channelId = params.get('id') ?? undefined;
        if (this.channelId) {
          this.initChannel(this.channelId);
        }
      })
    );

    this.subscriptions.add(
      this.channelService.channels$.subscribe(() => {
        if (this.channelId) {
          this.initChannel(this.channelId);
        }
      })
    );
  }

  /**
   * Initializes the current user based on authentication state.
   */
  auth() {
    const uid = this.authService.getCurrentUid();
    if (uid) { this.currUser = new User({ uid: uid }) }
    else { this.subAuth() }
  }

  /**
   * Subscribes to user authentication state and initializes the channel if necessary.
   */
  subAuth() {
    this.subscriptions.add(
      this.authService.user$.subscribe((user) => {
        if (user) {
          if (!this.currUser) { this.currUser = new User({ uid: user.uid }) }
          if (this.channelId && !this.channel) { this.initChannel(this.channelId) }
        }
      })
    );
  }

  /**
   * Cleans up subscriptions on component destruction.
   */
  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.scrollSub.unsubscribe();
  }

  /**
   * Opens a dialog displaying the user profile.
   * @param user - The user whose profile should be displayed.
   */
  openUserProfile(user: User): void {
    if (user) {
      this.dialog.open(UserProfileCardComponent, {
        data: user
      });
    }
  }

  /**
   * Initializes the channel and its users based on the provided channel ID.
   * @param channelId - The ID of the channel to initialize.
   */
  async initChannel(channelId: string): Promise<void> {
    if (!channelId) {
      console.error('Channel ID is not defined');
      return;
    }
    try {
      const channel = await this.channelService.getChannel(channelId);
      if (channel) {
        this.channel = channel;
        this.initUsers(channel);
        this.updateChannelMembersData();
        this.scrollSub = this.route.queryParams.subscribe(params => {
          setTimeout(() => this.goToPost(params['post']), 20);
        });
      } else {
        this.onInvalidOrForbiddenRoute = true;
      }
    } catch (error) {
      console.error('Error fetching channel:', error);
    }
  }

  /**
   * Updates the channel members data if it has not been updated already.
   */
  updateChannelMembersData(): void {
    if (!this.channelMembersDataUpdated) {
      this.channelMembersDataUpdated = true;
      const usersSub: Subscription = this.usersService.users$.subscribe(async () => {
        if (this.channel) {
          this.runtimeUpdateChannelMembersData();
          usersSub.unsubscribe();
          await this.channelService.updateChannel(this.channel);
        }
      });
    }
  }

  /**
   * Updates channel members data in runtime.
   */
  runtimeUpdateChannelMembersData(): void {
    if (this.channel) {
      for (let i = 0; i < this.channel.members.length; i++) {
        let m = this.channel.members[i];
        const updatedUser: User | undefined = this.usersService.getUserByUid(m.uid);
        if (updatedUser) { this.channel.members[i] = updatedUser }
      };
    }
  }

  /**
   * Navigates to a specific post if needed.
   * @param postId - The ID of the post to navigate to.
   */
  goToPost(postId: string | undefined) {
    this.postsSub = this.messageItems.changes.subscribe((elements: QueryList<ElementRef>) => {
      (postId && postId.length > 0) ? this.handlePostAndThreadScrolling(elements, postId) : this.autoscrollToLastPost(elements);
    });
    this.messageItems.notifyOnChanges();
  }

  /**
   * Checks if the length of posts has changed compared to the previously saved length.
   * @param elements - The list of message items.
   * @returns True if the length has changed, otherwise false.
   */
  hasPostLengthChanged(elements: QueryList<ElementRef>): boolean {
    const currentLength = elements.toArray().length;
    if (currentLength != this.savedPostsLength) {
      this.savedPostsLength = currentLength;
      return true;
    } else {
      return false;
    }
  }

  /**
   * Handles scrolling to a specific post or thread.
   * @param elements - The list of message items.
   * @param postId - The ID of the post to scroll to.
   */
  handlePostAndThreadScrolling(elements: QueryList<ElementRef>, postId: string) {
    if (this.channel) {
      const postRef = elements.find(el => el.nativeElement.id === postId);
      if (postRef) {
        this.autoscrollToPost(postRef);
      } else if (this.channelService.isPostInThread(this.channel, postId)) {
        this.openThreadAndAutoscrollToFirstPost(elements, postId);
      }
    }
  }

  /**
   * Autoscrolls to a specific post element.
   * @param postRef - The reference to the post element.
   */
  autoscrollToPost(postRef: ElementRef<any>) {
    this.postsSub.unsubscribe();
    postRef.nativeElement.scrollIntoView({ behavior: 'smooth' });
    this.router.navigate([], {
      queryParams: { 'post': null },
      queryParamsHandling: 'merge'
    });
  }

  /**
   * Autoscrolls to the last post element.
   * @param elements - The list of message items.
   */
  autoscrollToLastPost(elements: QueryList<ElementRef>) {
    if (this.hasPostLengthChanged(elements)) {
      const array = elements.toArray();
      const postRef = array.pop();
      if (postRef) { postRef.nativeElement.scrollIntoView({}); }
    }
  }

  /**
   * Opens a thread and autoscrolls to the first post in that thread.
   * @param elements - The list of message items.
   * @param postId - The ID of the post to find and open the thread for.
   */
  openThreadAndAutoscrollToFirstPost(elements: QueryList<ElementRef>, postId: string) {
    if (this.channel) {
      const { postInThread, thread_id } = this.channelService.getPostInThread(this.channel, postId);
      if (thread_id.length > 0) {
        const firstPost: Post | undefined = this.channel.posts.find(p => p.thread.thread_id === thread_id);
        const firstPostRef = elements.find(el => el.nativeElement.id === firstPost?.post_id);
        firstPostRef?.nativeElement.scrollIntoView();
        this.handleThread(thread_id);
      }
    }
  }

  /**
   * Initializes the user and recipient based on the channel members.
   * @param channel - The channel to initialize users for.
   */
  initUsers(channel: Channel): void {
    if (channel.members.length > 1) {
      this.currUser = channel.members.find(m => m.uid === this.currUser?.uid);
      if (this.currUser) {
        this.onInvalidOrForbiddenRoute = false;
        this.recipient = channel.members.find(m => m.uid != this.currUser?.uid) || this.currUser;
      } else {
        this.onInvalidOrForbiddenRoute = true;
      }
    } else {
      console.error('Recipient not found in channel members');
    }
  }

  /**
   * Creates a new post in the direct message channel.
   * @param data - The data for the new post.
   */
  async onCreatePost(data: any): Promise<void> {
    try {
      if (!this.currUser?.uid || !this.channel?.channel_id) {
        console.error('User ID or channel is not set.');
        return;
      }

      await this.channelService.addPostToPmChannel(this.channel.channel_id, this.currUser.uid, data.message, data.attachmentSrc);
    } catch (err) {
      console.error('Error adding post to the channel:', err);
    }
  }

  /**
   * Checks if the current user is the author of the first post in the channel.
   * @returns True if the current user is the author, otherwise false.
   */
  isCurrentUserAuthor(index: number): boolean {
    const firstPost = this.channel!.posts[index];
    return this.currUser?.uid === firstPost.user_id;
  }

  /**
   * Handles opening a thread based on the provided thread ID.
   * @param threadId - The ID of the thread to open.
   */
  handleThread(threadId: string): void {
    if (this.channel && this.channel.posts) {
      const post = this.channel.posts.find(post => post.thread.thread_id === threadId);
      if (post) {
        this.currPost = post;
        this.openTh = true;
        this.openThAni = true;
      } else {
        console.error(`Thread with ID ${threadId} not found.`);
        this.currPost = undefined;
      }
    } else {
      console.error('Current channel or posts are not defined.');
    }
  }

  /**
   * Closes the current thread based on the provided event value.
   * @param event - The value indicating whether to close the thread or not.
   */
  closeThread(event: any) {
    this.openTh = event;
  }

  /**
   * Closes the current thread based on the provided event value after animation.
   * @param event - The value indicating whether to close the thread or not.
   */
  closeThreadTime(event: string) {
    this.openThAni = false;
    if (event == 'falseTime') {
      setTimeout(() => {
        this.openTh = false;
      }, 300);
    } else {
      this.openTh = false;
    }
  }
}
